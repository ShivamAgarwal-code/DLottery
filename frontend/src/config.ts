import DLotteryAbiJson from "./abi/DLottery.abi.json";
import USD8AbiJson from "./abi/USD8.abi.json";
import type { Abi, Address } from "viem";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);
export const RPC_URL =
  (import.meta.env.VITE_RPC_URL as string | undefined) ?? "http://127.0.0.1:8545";

// Defaults are the deterministic addresses from a fresh Hardhat deployment
// (USD8 deployed first, DLottery second). Override via .env for other networks.
export const USD8_ADDRESS = ((import.meta.env.VITE_USD8_ADDRESS as string | undefined) ??
  "0x5FbDB2315678afecb367f032d93F642f64180aa3") as Address;

export const LOTTERY_ADDRESS = ((import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined) ??
  "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512") as Address;

export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "http://localhost:8080";

export const DLotteryAbi = DLotteryAbiJson as Abi;
export const USD8Abi = USD8AbiJson as Abi;

// DrawStatus enum mirrors contracts/DLottery.sol.
export enum DrawStatus {
  None = 0,
  Active = 1,
  Completed = 2,
  NoWinner = 3,
  Cancelled = 4,
}

export const USD8_DECIMALS = 18;
