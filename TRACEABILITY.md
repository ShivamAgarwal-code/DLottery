# Requirements Traceability Matrix

Maps every PRD requirement identifier to its implementation and, where applicable, its test.

## Smart contract (PRD §2)

| ID    | Requirement                                             | Implementation (`contracts/contracts/DLottery.sol`) | Test (`contracts/test/DLottery.test.ts`) |
| ----- | ------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| SC-01 | Initialize the lottery configuration                   | `constructor`, `setDao/setTicketPrice/setMinParticipants` | “initialization & configuration” |
| SC-02 | Unique Draw ID per round                               | `_startNewDraw` (`newId = previousId + 1`)          | “unique monotonic id” |
| SC-03 | Start a new draw and record start time                 | `_startNewDraw` (`startTime`, `endTime`)            | “starts the first draw” |
| SC-04 | Previous draw finalized before a new one starts        | `_startNewDraw` (reverts `PreviousDrawNotFinalized`)| settlement/rollover tests |
| SC-05 | Carry forward rollover funds                           | `_startNewDraw(rollover)`, `pendingRollover`        | “rollover carry-forward”, “NO_WINNER rolls over” |
| SC-06 | Manage draw state transitions                          | `DrawStatus` enum + status writes                   | all settlement tests |
| SC-07 | Accept USD8 as ticket payment                          | `buyTicket` → `usd8.safeTransferFrom`               | “accepts USD8 and emits TicketBought” |
| SC-08 | Validate status + 24-hour deadline before purchase     | `buyTicket` (`DrawNotActive`/`DrawExpired`)         | “rejects after deadline”, “not active” |
| SC-09 | Enforce maximum participant limit (5)                  | `buyTicket` (`DrawFull`)                            | “enforces the maximum participant limit” |
| SC-10 | One ticket per wallet per draw                         | `buyTicket` (`AlreadyParticipating`)               | “only one ticket per wallet” |
| SC-11 | Assign a unique ticket number 1–10                     | `buyTicket` (range check + `_numberOwner`)          | “ticket number must be within 1..10” |
| SC-12 | Prevent duplicate ticket numbers                       | `buyTicket` (`TicketNumberTaken`)                  | “prevents duplicate ticket numbers” |
| SC-13 | Emit an event per ticket purchase                      | `TicketBought`                                      | “emits TicketBought” |
| SC-14 | Draw only when eligible for settlement                 | `performDraw` + `_isEligibleForDraw`                | “cannot draw before eligible”, “eligible when full” |
| SC-15 | Verify minimum participant requirement                 | `performDraw` (cancel branch)                      | “cancels when below minimum” |
| SC-16 | Generate the lucky number                              | `_generateLuckyNumber`                              | settlement tests |
| SC-17 | Determine whether a ticket matches                     | `performDraw` (`_numberOwner[lucky]`)              | “records a winner when matches” |
| SC-18 | Record the winner on a match                           | `performDraw` (`draw.winner = winner`)             | “records a winner” / prize test |
| SC-19 | Mark round NO_WINNER when no match                     | `performDraw` (NoWinner branch)                    | “NO_WINNER rolls the pool” |
| SC-20 | Roll over the prize pool when no winner                | `performDraw` (`pendingRollover = totalPool`)      | “NO_WINNER rolls the pool” |
| SC-21 | Only the winner may claim                              | `claimPrize` (`NotWinner`)                         | prize test (non-winner reverts) |
| SC-22 | Calculate the winner's net profit                     | `performDraw` (`netProfit = totalPool - ticketPrice`) | worked-example test |
| SC-23 | Transfer DAO fee to the DAO                            | `claimPrize` (`usd8.safeTransfer(dao, daoFee)`)    | prize test (dao balance) |
| SC-24 | Transfer remaining prize to the winner                | `claimPrize` (`usd8.safeTransfer(winner, …)`)      | prize test (winner balance, once) |
| SC-25 | Refunds only for cancelled rounds                     | `claimRefund` (`NotCancelled`)                     | “cannot refund a non-cancelled draw” |
| SC-26 | Claim principal only once                              | `claimRefund` (`_refundClaimed`)                   | “once per participant” |

### Required events (PRD §2.5)

`DrawStarted`, `TicketBought`, `LotteryDrawn`, `DrawCancelled`, `PrizeClaimed`,
`RefundClaimed` — all declared and emitted in `DLottery.sol`.

## Backend (PRD §3)

| ID    | Requirement                      | Implementation (`backend/`) |
| ----- | -------------------------------- | --------------------------- |
| BE-01 | Containerized deployment         | `Dockerfile`, root `docker-compose.yml` |
| BE-02 | Blockchain RPC connectivity      | `src/rpc.rs` (`RpcClient`) |
| BE-03 | MySQL/PostgreSQL connectivity    | `src/db.rs` + `migrations/0001_init.sql` (Postgres) |
| BE-04 | REST API service                 | `src/api.rs` (axum) |
| BE-05 | Blockchain event listener        | `src/indexer.rs` (`run`, `index_cycle`) |
| BE-06 | Production logging + error handling | `tracing` in `main.rs`, `ApiError`, `error!` in indexer |
| BE-07 | RPC reconnection                 | `src/rpc.rs` retry loop; cycle re-run each tick |
| BE-08 | Event processing                 | `src/indexer.rs` `process_log` / `apply_event` |
| BE-09 | Block confirmation handling      | `src/indexer.rs` (`safe = latest - confirmations`) |
| BE-10 | Chain reorganization protection  | `src/indexer.rs` reorg check + `db::rewind` |
| BE-11 | Retry and error handling         | `src/rpc.rs` backoff; resilient `run` loop |

**Idempotent sync (PRD 3.3):** `processed_events (tx_hash, log_index)` dedup ledger +
`UNIQUE (draw_id, ticket_number)` + upserts. **History fields (PRD 3.3 table):** `draws`
schema in `migrations/0001_init.sql`.

### API (PRD §3.4)

| Endpoint                      | Handler (`src/api.rs`) |
| ----------------------------- | ---------------------- |
| `GET /api/v1/draws/current`   | `current_draw` |
| `GET /api/v1/draws/history`   | `history` |

## Frontend (PRD §4)

| ID / §| Requirement                         | Implementation (`frontend/src/`) |
| ----- | ----------------------------------- | -------------------------------- |
| FE-01 | Connect a Web3 wallet               | `components/WalletBar.tsx` (injected connector) |
| FE-02 | Display connected wallet address    | `components/WalletBar.tsx` |
| FE-03 | Display USD8 balance                | `components/WalletBar.tsx` + `hooks/useLottery.ts` (`useUSD8`) |
| FE-04 | Detect participation status         | `hooks/useLottery.ts` (`myTicket`), `components/BuyTicket.tsx` |
| FE-05 | Enable/disable by draw status       | `components/Dashboard.tsx`, `components/BuyTicket.tsx` |
| 4.2   | Active draw dashboard + 1–10 table  | `components/Dashboard.tsx`, `components/AllocationTable.tsx` |
| 4.3   | Purchase flow (balance→allowance→approve→buy→status→number→lock) | `components/BuyTicket.tsx` |
| 4.4   | Perform Lottery Draw (+ loading)    | `components/PerformDraw.tsx` |
| 4.5   | Winner / no-winner / refund views   | `components/ResultView.tsx`, `components/RefundView.tsx`, `components/LatestResult.tsx` |
| 4.6   | Draw history                        | `components/History.tsx` (backend API) |

## Core flows & calculations (PRD §5)

| §   | Topic                     | Where |
| --- | ------------------------- | ----- |
| 5.1 | Draw lifecycle            | `DLottery.performDraw` / `_startNewDraw`; UI in `Dashboard.tsx` |
| 5.2 | Ticket purchase flow      | `components/BuyTicket.tsx` |
| 5.3 | Refund flow               | `DLottery.claimRefund`; `components/RefundView.tsx` |
| 5.4 | Prize pool & winner profit| `DLottery.performDraw` (`totalPool`, `netProfit`) |
| 5.5 | DAO fee & winner payout   | `DLottery.performDraw` / `claimPrize` |
| 5.6 | Worked example            | asserted in `contracts/test/DLottery.test.ts` |
