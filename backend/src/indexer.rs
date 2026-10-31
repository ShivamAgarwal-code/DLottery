//! Blockchain event listener / indexer (PRD 3.2, BE-05..BE-11).
//!
//! Strategy: poll `eth_getLogs` for the contract in confirmed block ranges, decode each
//! event with the shared ABI bindings, and apply it idempotently to Postgres inside a
//! transaction guarded by a (tx_hash, log_index) dedup ledger.

use crate::config::Config;
use crate::contract::DLottery;
use crate::db;
use crate::rpc::{RawLog, RpcClient};
use alloy::primitives::Address;
use alloy::sol_types::SolEvent;
use anyhow::Result;
use sqlx::postgres::PgPool;
use std::time::Duration;
use tracing::{debug, error, info, warn};

pub async fn run(cfg: Config, pool: PgPool) {
    let rpc = RpcClient::new(cfg.rpc_url.clone());
    info!(
        contract = %cfg.contract_address,
        confirmations = cfg.confirmations,
        "starting event listener"
    );

    loop {
        if let Err(e) = index_cycle(&cfg, &rpc, &pool).await {
            // BE-11: never let the loop die; log and retry on the next tick.
            error!("index cycle failed: {e:#}");
        }
        tokio::time::sleep(Duration::from_secs(cfg.poll_interval_secs)).await;
    }
}

async fn index_cycle(cfg: &Config, rpc: &RpcClient, pool: &PgPool) -> Result<()> {
    let latest = rpc.block_number().await?;
    if latest < cfg.confirmations {
        return Ok(());
    }
    // BE-09: only index blocks that have enough confirmations to be considered final.
    let safe = latest - cfg.confirmations;

    let mut state = db::get_or_init_state(pool, cfg.start_block).await?;

    // BE-10: reorg detection. If the hash we recorded for the last processed block no
    // longer matches the chain, rewind and re-apply from a safe depth.
    if let Some(prev_hash) = state.last_block_hash.clone() {
        if state.last_processed_block >= 0 {
            let onchain = rpc.block_hash(state.last_processed_block as u64).await?;
            let mismatch = match onchain {
                Some(h) => !h.eq_ignore_ascii_case(&prev_hash),
                None => true,
            };
            if mismatch {
                let rewind = (state.last_processed_block - cfg.reorg_depth as i64).max(
                    cfg.start_block as i64 - 1,
                );
                warn!(
                    from = state.last_processed_block,
                    to = rewind,
                    "chain reorganization detected; rewinding"
                );
                db::rewind(pool, rewind).await?;
                state.last_processed_block = rewind;
            }
        }
    }

    let from = (state.last_processed_block + 1) as u64;
    if from > safe {
        debug!(from, safe, "nothing new to index");
        return Ok(());
    }
    let to = safe.min(from + cfg.max_block_range - 1);

    let logs = rpc.get_logs(&cfg.contract_address, from, to).await?;
    if !logs.is_empty() {
        info!(from, to, count = logs.len(), "processing logs");
    }
    for log in &logs {
        process_log(pool, log).await?;
    }

    // Record the cursor and the hash of `to` for future reorg checks.
    if let Some(hash) = rpc.block_hash(to).await? {
        db::set_state(pool, to as i64, &hash).await?;
    } else {
        // Block vanished between get_logs and now; leave cursor, retry next cycle.
        warn!(block = to, "could not fetch block hash for cursor; will retry");
    }
    Ok(())
}

/// Apply a single log exactly once (PRD 3.3 idempotency).
async fn process_log(pool: &PgPool, log: &RawLog) -> Result<()> {
    if log.topics.is_empty() {
        return Ok(());
    }
    let topic0 = log.topics[0];
    let event_type = event_name(topic0);
    let Some(event_type) = event_type else {
        // Unknown/irrelevant event - ignore.
        return Ok(());
    };

    let mut tx = pool.begin().await?;

    // Dedup ledger insert; if it already exists, this event was applied before.
    let inserted = sqlx::query(
        "INSERT INTO processed_events (tx_hash, log_index, block_number, block_hash, event_type)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tx_hash, log_index) DO NOTHING",
    )
    .bind(&log.tx_hash)
    .bind(log.log_index as i64)
    .bind(log.block_number as i64)
    .bind(&log.block_hash)
    .bind(event_type)
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if inserted == 0 {
        tx.rollback().await?;
        return Ok(());
    }

    apply_event(&mut tx, log, topic0).await?;
    tx.commit().await?;
    Ok(())
}

fn event_name(topic0: alloy::primitives::B256) -> Option<&'static str> {
    if topic0 == DLottery::DrawStarted::SIGNATURE_HASH {
        Some("DrawStarted")
    } else if topic0 == DLottery::TicketBought::SIGNATURE_HASH {
        Some("TicketBought")
    } else if topic0 == DLottery::LotteryDrawn::SIGNATURE_HASH {
        Some("LotteryDrawn")
    } else if topic0 == DLottery::DrawCancelled::SIGNATURE_HASH {
        Some("DrawCancelled")
    } else if topic0 == DLottery::PrizeClaimed::SIGNATURE_HASH {
        Some("PrizeClaimed")
    } else if topic0 == DLottery::RefundClaimed::SIGNATURE_HASH {
        Some("RefundClaimed")
    } else {
        None
    }
}

async fn apply_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    log: &RawLog,
    topic0: alloy::primitives::B256,
) -> Result<()> {
    let topics = log.topics.iter().copied();

    if topic0 == DLottery::DrawStarted::SIGNATURE_HASH {
        let ev = DLottery::DrawStarted::decode_raw_log(topics, &log.data, true)?;
        sqlx::query(
            "INSERT INTO draws
               (draw_id, status, start_time, end_time, ticket_price, rollover,
                min_participants, created_block, updated_at)
             VALUES ($1, 'ACTIVE', $2, $3, $4, $5, $6, $7, now())
             ON CONFLICT (draw_id) DO UPDATE SET
               start_time = EXCLUDED.start_time,
               end_time = EXCLUDED.end_time,
               ticket_price = EXCLUDED.ticket_price,
               rollover = EXCLUDED.rollover,
               min_participants = EXCLUDED.min_participants,
               updated_at = now()",
        )
        .bind(to_i64(&ev.drawId.to_string()))
        .bind(to_i64(&ev.startTime.to_string()))
        .bind(to_i64(&ev.endTime.to_string()))
        .bind(ev.ticketPrice.to_string())
        .bind(ev.rollover.to_string())
        .bind(ev.minParticipants as i32)
        .bind(log.block_number as i64)
        .execute(&mut **tx)
        .await?;
    } else if topic0 == DLottery::TicketBought::SIGNATURE_HASH {
        let ev = DLottery::TicketBought::decode_raw_log(topics, &log.data, true)?;
        let draw_id = to_i64(&ev.drawId.to_string());
        sqlx::query(
            "INSERT INTO tickets (draw_id, buyer, ticket_number, tx_hash, log_index, block_number)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (draw_id, ticket_number) DO NOTHING",
        )
        .bind(draw_id)
        .bind(addr(&ev.buyer))
        .bind(ev.ticketNumber as i16)
        .bind(&log.tx_hash)
        .bind(log.log_index as i64)
        .bind(log.block_number as i64)
        .execute(&mut **tx)
        .await?;

        // Idempotent, monotonic participant count from the event payload.
        sqlx::query(
            "UPDATE draws SET participant_count = GREATEST(participant_count, $2), updated_at = now()
             WHERE draw_id = $1",
        )
        .bind(draw_id)
        .bind(to_i64(&ev.participantCount.to_string()) as i32)
        .execute(&mut **tx)
        .await?;
    } else if topic0 == DLottery::LotteryDrawn::SIGNATURE_HASH {
        let ev = DLottery::LotteryDrawn::decode_raw_log(topics, &log.data, true)?;
        let winner = if ev.winner == Address::ZERO {
            String::new()
        } else {
            addr(&ev.winner)
        };
        sqlx::query(
            "UPDATE draws SET
               status = CASE WHEN $2 = '' THEN 'NO_WINNER' ELSE 'COMPLETED' END,
               lucky_number = $3,
               winner_address = NULLIF($2, ''),
               total_prize_pool = $4,
               dao_fee = $5,
               winner_prize = $6,
               updated_at = now()
             WHERE draw_id = $1",
        )
        .bind(to_i64(&ev.drawId.to_string()))
        .bind(&winner)
        .bind(ev.luckyNumber as i16)
        .bind(ev.totalPool.to_string())
        .bind(ev.daoFee.to_string())
        .bind(ev.winnerPrize.to_string())
        .execute(&mut **tx)
        .await?;
    } else if topic0 == DLottery::DrawCancelled::SIGNATURE_HASH {
        let ev = DLottery::DrawCancelled::decode_raw_log(topics, &log.data, true)?;
        sqlx::query(
            "UPDATE draws SET status = 'CANCELLED',
               participant_count = GREATEST(participant_count, $2), updated_at = now()
             WHERE draw_id = $1",
        )
        .bind(to_i64(&ev.drawId.to_string()))
        .bind(to_i64(&ev.participantCount.to_string()) as i32)
        .execute(&mut **tx)
        .await?;
    } else if topic0 == DLottery::PrizeClaimed::SIGNATURE_HASH {
        let ev = DLottery::PrizeClaimed::decode_raw_log(topics, &log.data, true)?;
        sqlx::query("UPDATE draws SET prize_claimed = TRUE, updated_at = now() WHERE draw_id = $1")
            .bind(to_i64(&ev.drawId.to_string()))
            .execute(&mut **tx)
            .await?;
    } else if topic0 == DLottery::RefundClaimed::SIGNATURE_HASH {
        let ev = DLottery::RefundClaimed::decode_raw_log(topics, &log.data, true)?;
        sqlx::query(
            "INSERT INTO refunds (draw_id, participant, amount, tx_hash, log_index)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (draw_id, participant) DO NOTHING",
        )
        .bind(to_i64(&ev.drawId.to_string()))
        .bind(addr(&ev.participant))
        .bind(ev.amount.to_string())
        .bind(&log.tx_hash)
        .bind(log.log_index as i64)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

fn to_i64(decimal: &str) -> i64 {
    decimal.parse::<i64>().unwrap_or(0)
}

fn addr(a: &Address) -> String {
    format!("{a:#x}")
}
