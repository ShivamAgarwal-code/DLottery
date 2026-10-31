use anyhow::{Context, Result};

/// Runtime configuration, loaded from environment variables (BE-01 containerized config).
#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub rpc_url: String,
    pub contract_address: String,
    pub start_block: u64,
    pub confirmations: u64,
    pub reorg_depth: u64,
    pub max_block_range: u64,
    pub poll_interval_secs: u64,
    pub http_addr: String,
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn parse_u64(key: &str, default: u64) -> Result<u64> {
    match std::env::var(key) {
        Ok(v) => v.parse::<u64>().with_context(|| format!("invalid u64 for {key}: {v}")),
        Err(_) => Ok(default),
    }
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL is required")?,
            rpc_url: std::env::var("RPC_URL").context("RPC_URL is required")?,
            contract_address: std::env::var("CONTRACT_ADDRESS")
                .context("CONTRACT_ADDRESS is required")?
                .to_lowercase(),
            // Block at which the DLottery contract was deployed; the indexer starts here.
            start_block: parse_u64("START_BLOCK", 0)?,
            // Blocks to wait before treating a log as final (BE-09 block confirmations).
            confirmations: parse_u64("CONFIRMATIONS", 3)?,
            // How far to rewind when a reorg is detected (BE-10).
            reorg_depth: parse_u64("REORG_DEPTH", 12)?,
            // Max span of a single eth_getLogs request.
            max_block_range: parse_u64("MAX_BLOCK_RANGE", 2000)?,
            poll_interval_secs: parse_u64("POLL_INTERVAL_SECS", 5)?,
            // Hosts like Render/Railway/Fly inject a PORT env var the service must bind to.
            // Prefer it; otherwise fall back to HTTP_ADDR (default 0.0.0.0:8080).
            http_addr: match std::env::var("PORT") {
                Ok(port) if !port.is_empty() => format!("0.0.0.0:{port}"),
                _ => env_or("HTTP_ADDR", "0.0.0.0:8080"),
            },
        })
    }
}
