# DLottery - Backend (Rust)

Passive blockchain **event indexer + REST query service** (PRD section 3). It never
determines lottery results or controls funds - it only reads events and serves history.

## Stack

- **axum** - REST API (BE-04)
- **sqlx + Postgres** - storage (BE-03), all writes idempotent (PRD 3.3)
- **alloy (sol-types)** - ABI/event decoding from the shared `abi/DLottery.abi.json`
- **reqwest JSON-RPC** - chain I/O with retry/backoff (BE-02, BE-07, BE-11)
- **tracing** - structured logging (BE-06)

## Endpoints (PRD 3.4)

| Method | Path                      | Returns                                                                 |
| ------ | ------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/v1/draws/current`   | current draw, status, remaining time, participants, 1-10 allocation, pool |
| GET    | `/api/v1/draws/history`   | paginated history (`?page=&page_size=`): id, status, times, lucky number, winner, pool, DAO fee, winner prize |
| GET    | `/health`                 | liveness probe                                                         |

## Indexer behaviour (BE-05 … BE-11)

- **BE-05 listener:** polls `eth_getLogs` for the contract across confirmed block ranges.
- **BE-07 reconnection / BE-11 retry:** every RPC call retries with exponential backoff; a
  failed cycle is logged and retried on the next tick - the loop never dies.
- **BE-08 processing:** decodes all six events (DrawStarted, TicketBought, LotteryDrawn,
  DrawCancelled, PrizeClaimed, RefundClaimed) and applies them to Postgres.
- **BE-09 confirmations:** only blocks at least `CONFIRMATIONS` deep are indexed.
- **BE-10 reorg protection:** the hash of the last processed block is re-checked each cycle;
  on mismatch the indexer rewinds `REORG_DEPTH` blocks and re-applies canonical logs.
- **Idempotency (PRD 3.3):** a `(tx_hash, log_index)` dedup ledger plus unique constraints
  guarantee no duplicate data even across reorgs/restarts.

## Configuration

Copy `.env.example` → `.env`. Key vars: `DATABASE_URL`, `RPC_URL`, `CONTRACT_ADDRESS`,
`START_BLOCK`, `CONFIRMATIONS`, `REORG_DEPTH`, `HTTP_ADDR`.

## Run

```bash
# With Docker (recommended - see repo-root docker-compose.yml)
docker build -t dlottery-backend .

# Local (requires Rust 1.90+ and a reachable Postgres + RPC)
cargo run --release
```

Migrations in `migrations/` are embedded in the binary and run automatically on startup.
