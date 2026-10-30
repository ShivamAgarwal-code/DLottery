//! Database access layer (BE-03 Postgres connectivity, PRD 3.3 idempotent sync).

use crate::models::{AllocationCell, DrawRow, IndexerState, Participant};
use anyhow::{Context, Result};
use sqlx::postgres::{PgPool, PgPoolOptions};

pub async fn connect(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .context("connecting to Postgres")?;
    Ok(pool)
}

/// Apply embedded SQL migrations.
pub async fn migrate(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .context("running migrations")?;
    Ok(())
}

/// Read the indexer cursor, seeding it from `start_block` on first run.
pub async fn get_or_init_state(pool: &PgPool, start_block: u64) -> Result<IndexerState> {
    let row = sqlx::query_as::<_, (i64, Option<String>)>(
        "SELECT last_processed_block, last_block_hash FROM indexer_state WHERE id = 1",
    )
    .fetch_optional(pool)
    .await?;

    if let Some((last_processed_block, last_block_hash)) = row {
        return Ok(IndexerState {
            last_processed_block,
            last_block_hash,
        });
    }

    // Seed so the first scanned block is `start_block`.
    let seed = start_block as i64 - 1;
    sqlx::query(
        "INSERT INTO indexer_state (id, last_processed_block, last_block_hash)
         VALUES (1, $1, NULL) ON CONFLICT (id) DO NOTHING",
    )
    .bind(seed)
    .execute(pool)
    .await?;

    Ok(IndexerState {
        last_processed_block: seed,
        last_block_hash: None,
    })
}

pub async fn set_state(pool: &PgPool, block: i64, hash: &str) -> Result<()> {
    sqlx::query(
        "UPDATE indexer_state SET last_processed_block = $1, last_block_hash = $2 WHERE id = 1",
    )
    .bind(block)
    .bind(hash)
    .execute(pool)
    .await?;
    Ok(())
}

/// Rewind on reorg (BE-10): drop processed-event markers at or above `block` so the
/// corresponding canonical logs are re-fetched and re-applied idempotently.
pub async fn rewind(pool: &PgPool, block: i64) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM processed_events WHERE block_number >= $1")
        .bind(block)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE indexer_state SET last_processed_block = $1, last_block_hash = NULL WHERE id = 1",
    )
    .bind(block)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// API queries
// ---------------------------------------------------------------------------

const DRAW_COLUMNS: &str = "draw_id, status, start_time, end_time, ticket_price, \
    participant_count, lucky_number, winner_address, total_prize_pool, dao_fee, \
    winner_prize, rollover, min_participants, prize_claimed";

pub async fn current_draw(pool: &PgPool) -> Result<Option<DrawRow>> {
    let sql = format!(
        "SELECT {DRAW_COLUMNS} FROM draws ORDER BY draw_id DESC LIMIT 1"
    );
    let row = sqlx::query_as::<_, DrawRow>(&sql).fetch_optional(pool).await?;
    Ok(row)
}

pub async fn allocation(pool: &PgPool, draw_id: i64) -> Result<Vec<AllocationCell>> {
    let rows = sqlx::query_as::<_, (i16, String)>(
        "SELECT ticket_number, buyer FROM tickets WHERE draw_id = $1",
    )
    .bind(draw_id)
    .fetch_all(pool)
    .await?;

    let mut cells: Vec<AllocationCell> = (1..=10)
        .map(|n| AllocationCell {
            number: n,
            address: None,
        })
        .collect();
    for (number, buyer) in rows {
        if (1..=10).contains(&number) {
            cells[(number - 1) as usize].address = Some(buyer);
        }
    }
    Ok(cells)
}

pub async fn participants(pool: &PgPool, draw_id: i64) -> Result<Vec<Participant>> {
    let rows = sqlx::query_as::<_, (String, i16)>(
        "SELECT buyer, ticket_number FROM tickets WHERE draw_id = $1 ORDER BY ticket_number",
    )
    .bind(draw_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(address, ticket_number)| Participant {
            address,
            ticket_number,
        })
        .collect())
}

pub async fn history(pool: &PgPool, page: i64, page_size: i64) -> Result<(Vec<DrawRow>, i64)> {
    let offset = (page - 1) * page_size;
    let sql = format!(
        "SELECT {DRAW_COLUMNS} FROM draws ORDER BY draw_id DESC LIMIT $1 OFFSET $2"
    );
    let draws = sqlx::query_as::<_, DrawRow>(&sql)
        .bind(page_size)
        .bind(offset)
        .fetch_all(pool)
        .await?;

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM draws")
        .fetch_one(pool)
        .await?;
    Ok((draws, total.0))
}
