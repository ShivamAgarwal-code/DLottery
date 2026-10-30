use serde::Serialize;
use sqlx::FromRow;

/// A draw row as stored/returned by the indexer (PRD 3.3 fields).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DrawRow {
    pub draw_id: i64,
    pub status: String,
    pub start_time: i64,
    pub end_time: i64,
    pub ticket_price: String,
    pub participant_count: i32,
    pub lucky_number: Option<i16>,
    pub winner_address: Option<String>,
    pub total_prize_pool: String,
    pub dao_fee: String,
    pub winner_prize: String,
    pub rollover: String,
    pub min_participants: i32,
    pub prize_claimed: bool,
}

/// One cell of the 1..10 ticket allocation table (PRD 4.2).
#[derive(Debug, Clone, Serialize)]
pub struct AllocationCell {
    pub number: i16,
    pub address: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Participant {
    pub address: String,
    pub ticket_number: i16,
}

/// Response for GET /api/v1/draws/current.
#[derive(Debug, Clone, Serialize)]
pub struct CurrentDrawResponse {
    #[serde(flatten)]
    pub draw: DrawRow,
    pub remaining_seconds: i64,
    pub is_eligible_for_draw: bool,
    pub allocation: Vec<AllocationCell>,
    pub participants: Vec<Participant>,
}

/// Response for GET /api/v1/draws/history.
#[derive(Debug, Clone, Serialize)]
pub struct HistoryResponse {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
    pub draws: Vec<DrawRow>,
}

#[derive(Debug, Clone)]
pub struct IndexerState {
    pub last_processed_block: i64,
    pub last_block_hash: Option<String>,
}
