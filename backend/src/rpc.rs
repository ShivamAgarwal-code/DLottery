//! Minimal JSON-RPC client over HTTP with retry/backoff (BE-02, BE-07, BE-11).

use alloy::primitives::{hex, B256};
use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::str::FromStr;
use std::time::Duration;
use tracing::warn;

const MAX_ATTEMPTS: u32 = 5;

/// A decoded raw event log fetched from the chain.
#[derive(Debug, Clone)]
pub struct RawLog {
    pub topics: Vec<B256>,
    pub data: Vec<u8>,
    pub block_number: u64,
    pub block_hash: String,
    pub tx_hash: String,
    pub log_index: u64,
}

#[derive(Clone)]
pub struct RpcClient {
    http: reqwest::Client,
    url: String,
}

impl RpcClient {
    pub fn new(url: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build reqwest client");
        Self { http, url }
    }

    /// Perform a JSON-RPC call with bounded exponential backoff. Covers transient RPC
    /// outages / disconnects (BE-07 reconnection, BE-11 retry).
    async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        let mut attempt = 0;
        loop {
            attempt += 1;
            let result = self
                .http
                .post(&self.url)
                .json(&body)
                .send()
                .await
                .and_then(|r| r.error_for_status());

            match result {
                Ok(resp) => match resp.json::<Value>().await {
                    Ok(v) => {
                        if let Some(err) = v.get("error") {
                            // RPC-level error (e.g. range too large) - do not spin forever.
                            bail!("rpc error for {method}: {err}");
                        }
                        return v
                            .get("result")
                            .cloned()
                            .ok_or_else(|| anyhow!("missing result for {method}"));
                    }
                    Err(e) => {
                        if attempt >= MAX_ATTEMPTS {
                            return Err(e).context(format!("decode {method} after retries"));
                        }
                        warn!("rpc decode error ({method}) attempt {attempt}: {e}");
                    }
                },
                Err(e) => {
                    if attempt >= MAX_ATTEMPTS {
                        return Err(e).context(format!("rpc transport {method} after retries"));
                    }
                    warn!("rpc transport error ({method}) attempt {attempt}: {e}");
                }
            }

            let backoff = Duration::from_millis(250 * 2u64.pow(attempt - 1));
            tokio::time::sleep(backoff).await;
        }
    }

    pub async fn block_number(&self) -> Result<u64> {
        let v = self.call("eth_blockNumber", json!([])).await?;
        parse_hex_u64(v.as_str().context("blockNumber not a string")?)
    }

    /// Returns the canonical block hash at `number`, or None if the block is unknown.
    pub async fn block_hash(&self, number: u64) -> Result<Option<String>> {
        let v = self
            .call(
                "eth_getBlockByNumber",
                json!([format!("0x{number:x}"), false]),
            )
            .await?;
        if v.is_null() {
            return Ok(None);
        }
        Ok(v.get("hash").and_then(|h| h.as_str()).map(|s| s.to_string()))
    }

    /// Fetch contract logs in the inclusive block range [from, to] (BE-05, BE-08).
    pub async fn get_logs(&self, address: &str, from: u64, to: u64) -> Result<Vec<RawLog>> {
        let params = json!([{
            "address": address,
            "fromBlock": format!("0x{from:x}"),
            "toBlock": format!("0x{to:x}"),
        }]);
        let v = self.call("eth_getLogs", params).await?;
        let arr = v.as_array().context("eth_getLogs result not an array")?;

        let mut logs = Vec::with_capacity(arr.len());
        for item in arr {
            logs.push(parse_log(item)?);
        }
        // Deterministic order for sequential application.
        logs.sort_by(|a, b| {
            a.block_number
                .cmp(&b.block_number)
                .then(a.log_index.cmp(&b.log_index))
        });
        Ok(logs)
    }
}

fn parse_hex_u64(s: &str) -> Result<u64> {
    let trimmed = s.trim_start_matches("0x");
    u64::from_str_radix(trimmed, 16).with_context(|| format!("invalid hex u64: {s}"))
}

fn parse_log(item: &Value) -> Result<RawLog> {
    let topics = item
        .get("topics")
        .and_then(|t| t.as_array())
        .context("log missing topics")?
        .iter()
        .map(|t| {
            let s = t.as_str().context("topic not a string")?;
            B256::from_str(s).with_context(|| format!("invalid topic {s}"))
        })
        .collect::<Result<Vec<_>>>()?;

    let data_str = item
        .get("data")
        .and_then(|d| d.as_str())
        .unwrap_or("0x");
    let data = hex::decode(data_str.trim_start_matches("0x"))
        .with_context(|| format!("invalid log data {data_str}"))?;

    let block_number = parse_hex_u64(
        item.get("blockNumber")
            .and_then(|b| b.as_str())
            .context("log missing blockNumber")?,
    )?;
    let log_index = parse_hex_u64(
        item.get("logIndex")
            .and_then(|b| b.as_str())
            .context("log missing logIndex")?,
    )?;

    Ok(RawLog {
        topics,
        data,
        block_number,
        block_hash: item
            .get("blockHash")
            .and_then(|b| b.as_str())
            .unwrap_or_default()
            .to_string(),
        tx_hash: item
            .get("transactionHash")
            .and_then(|b| b.as_str())
            .unwrap_or_default()
            .to_string(),
        log_index,
    })
}
