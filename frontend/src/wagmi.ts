import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";
import { CHAIN_ID, RPC_URL } from "./config";

// Build the target chain from env so the same app works against a local Hardhat node
// or any EVM-compatible network (FE-01).
export const targetChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 31337 ? "Hardhat" : `Chain ${CHAIN_ID}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

export const wagmiConfig = createConfig({
  chains: [targetChain],
  connectors: [injected()],
  transports: {
    [targetChain.id]: http(RPC_URL),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
