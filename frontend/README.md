# DLottery — Frontend

React + Vite + TypeScript dApp using **wagmi/viem**. Implements PRD section 4.

## Features → requirements

| Area                      | Requirement / PRD | Where |
| ------------------------- | ----------------- | ----- |
| Connect wallet            | FE-01             | `WalletBar.tsx` (injected connector) |
| Show address              | FE-02             | `WalletBar.tsx` |
| Show USD8 balance         | FE-03             | `WalletBar.tsx` + `useUSD8` |
| Detect participation      | FE-04             | `useCurrentDraw.myTicket`, `BuyTicket.tsx` |
| Enable/disable by status  | FE-05             | `Dashboard.tsx`, `BuyTicket.tsx` |
| Active draw dashboard     | 4.2               | `Dashboard.tsx` |
| 1–10 allocation table     | 4.2               | `AllocationTable.tsx` |
| Purchase flow             | 4.3 / 5.2         | `BuyTicket.tsx` (balance → allowance → approve → buy → status → number → lock) |
| Perform Lottery Draw      | 4.4               | `PerformDraw.tsx` (loading animation + confirmation) |
| Winner / no-winner views  | 4.5               | `ResultView.tsx` |
| Refund view               | 4.5 / 5.3         | `RefundView.tsx` (disabled after claim) |
| Draw history              | 4.6               | `History.tsx` (backend `/api/v1/draws/history`) |

Current-draw state is read **live from the contract**; history is read from the **backend
indexer**. Everything auto-refreshes.

## Configure

Copy `.env.example` → `.env` and set addresses (defaults target a fresh local Hardhat
deployment) and `VITE_BACKEND_URL`.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

Requires a Web3 wallet (e.g. MetaMask) pointed at the configured chain. The ABIs in
`src/abi/` are generated from the contracts via `contracts/scripts/export-abi.ts`.
