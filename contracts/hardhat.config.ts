import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

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
  },
};

export default config;
