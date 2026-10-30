# DLottery — Smart Contracts

Hardhat project containing the authoritative on-chain logic (PRD section 2).

## Contracts

| Contract      | Purpose                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `USD8.sol`    | ERC-20 payment token (18 decimals) with an open faucet for test nets.  |
| `DLottery.sol`| Lottery rounds, ticket purchases, settlement, prizes, refunds, rollover, DAO fee. |

## Requirements coverage (SC-01 … SC-26)

Every requirement is referenced inline in `contracts/DLottery.sol`. Summary:

- **Draw management (SC-01–06):** `constructor` initialises config and starts draw 1;
  `_startNewDraw` assigns unique monotonic ids, records start time, enforces that the
  previous draw is finalized, carries rollover forward, and manages status transitions.
- **Ticket management (SC-07–13):** `buyTicket` accepts USD8, validates status + 24h
  deadline, enforces max 5 participants, one ticket per wallet, number range 1–10, no
  duplicate numbers, and emits `TicketBought`.
- **Settlement (SC-14–20):** `performDraw` is only callable when eligible (full or expired),
  verifies the minimum, generates the lucky number, records a winner or marks `NoWinner`,
  and rolls the pool over when there is no winner.
- **Prize & refunds (SC-21–26):** `claimPrize` pays the DAO fee + winner once, winner-only;
  `claimRefund` returns principal for cancelled rounds, once per participant.

## Economics (PRD 5.4–5.6)

```
P_total        = rollover + (participants × ticketPrice)
Net Profit     = P_total − ticketPrice            (winner principal excluded)
DAO Fee        = Net Profit × 5%
Winner Prize   = P_total − DAO Fee
```

Worked example (rollover 20, 5 players, price 10): pool 70, fee 3, winner 67 — asserted in tests.

## Randomness

The MVP lucky number (`_generateLuckyNumber`) uses on-chain entropy (`block.prevrandao`
+ draw salt). **Production must swap this for Chainlink VRF** to prevent validator
manipulation. This is documented at the top of `DLottery.sol`.

## Commands

```bash
npm install
npm run compile        # compile + generate typings
npm test               # run the full SC test suite (26 tests)
npm run coverage       # solidity-coverage report

# Local node + deploy (for backend/frontend dev)
npm run node           # starts a node on http://127.0.0.1:8545
npm run deploy:localhost
npm run export-abi     # copy ABIs to ../backend/abi and ../frontend/src/abi
```

Deployment addresses + ABIs are written to `deployments/` and mirrored to the backend and
frontend so all three components share one source of truth.
