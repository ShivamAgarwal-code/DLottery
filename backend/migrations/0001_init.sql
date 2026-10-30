-- DLottery indexer schema (PRD 3.3 database synchronization).
-- Token amounts are stored as decimal strings (TEXT) because USD8 values exceed the
-- range of 64-bit integers. All writes are idempotent (PRD 3.3).

CREATE TABLE IF NOT EXISTS draws (
    draw_id           BIGINT PRIMARY KEY,          -- Draw ID (unique identifier)
    status            TEXT   NOT NULL,             -- ACTIVE | COMPLETED | NO_WINNER | CANCELLED
    start_time        BIGINT NOT NULL,             -- draw opening timestamp (unix seconds)
    end_time          BIGINT NOT NULL,             -- draw closing timestamp (unix seconds)
    ticket_price      TEXT   NOT NULL,             -- price per ticket in USD8 base units
    participant_count INTEGER NOT NULL DEFAULT 0,  -- number of tickets sold
    lucky_number      SMALLINT,                    -- number generated at settlement (nullable)
    winner_address    TEXT,                        -- winner wallet, if any
    total_prize_pool  TEXT   NOT NULL DEFAULT '0', -- pool including rollover
    dao_fee           TEXT   NOT NULL DEFAULT '0', -- fee paid to the DAO
    winner_prize      TEXT   NOT NULL DEFAULT '0', -- amount claimable by the winner
    rollover          TEXT   NOT NULL DEFAULT '0', -- rollover carried into this draw
    min_participants  INTEGER NOT NULL DEFAULT 0,  -- minimum required to settle
    prize_claimed     BOOLEAN NOT NULL DEFAULT FALSE,
    created_block     BIGINT NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ticket per (draw, number). Also enforces idempotent re-processing of TicketBought.
CREATE TABLE IF NOT EXISTS tickets (
    id            BIGSERIAL PRIMARY KEY,
    draw_id       BIGINT   NOT NULL,
    buyer         TEXT     NOT NULL,
    ticket_number SMALLINT NOT NULL,
    tx_hash       TEXT     NOT NULL,
    log_index     BIGINT   NOT NULL,
    block_number  BIGINT   NOT NULL,
    UNIQUE (draw_id, ticket_number)
);
CREATE INDEX IF NOT EXISTS idx_tickets_draw ON tickets (draw_id);

CREATE TABLE IF NOT EXISTS refunds (
    draw_id     BIGINT NOT NULL,
    participant TEXT   NOT NULL,
    amount      TEXT   NOT NULL,
    tx_hash     TEXT   NOT NULL,
    log_index   BIGINT NOT NULL,
    PRIMARY KEY (draw_id, participant)
);

-- Dedup ledger: each (tx_hash, log_index) is applied exactly once (PRD 3.3 idempotency).
CREATE TABLE IF NOT EXISTS processed_events (
    tx_hash      TEXT   NOT NULL,
    log_index    BIGINT NOT NULL,
    block_number BIGINT NOT NULL,
    block_hash   TEXT   NOT NULL,
    event_type   TEXT   NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_processed_block ON processed_events (block_number);

-- Single-row cursor for the event listener.
CREATE TABLE IF NOT EXISTS indexer_state (
    id                   INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_block BIGINT  NOT NULL,
    last_block_hash      TEXT,
    CONSTRAINT single_row CHECK (id = 1)
);
