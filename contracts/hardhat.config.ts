import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// Testnet credentials are read from contracts/.env (gitignored). See .env.example.
const PRIVATE_KEY = process.env.PRIVATE_KEY?.trim();
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL?.trim() || "https://rpc.sepolia.org";
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local in-process network used by `hardhat test`.
    hardhat: {},
    // Standalone node started with `npm run node` (used by backend/frontend dev).
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Public testnet. Provide SEPOLIA_RPC_URL + PRIVATE_KEY in contracts/.env.
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts,
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};

export default config;
