import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useUSD8 } from "../hooks/useLottery";
import { formatUSD8, shortAddress } from "../lib/format";
import { CHAIN_ID } from "../config";
import { targetChain } from "../wagmi";

export function WalletBar() {
  // `chainId` here is the WALLET's current chain (not the app's configured chain),
  // so it correctly detects when MetaMask is on the wrong network.
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { balance } = useUSD8(address);

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
  const wrongNetwork = isConnected && chainId !== undefined && chainId !== CHAIN_ID;

  // Proactively ask the wallet to switch to the right network on connect / mismatch.
  useEffect(() => {
    if (wrongNetwork) {
      try {
        switchChain({ chainId: CHAIN_ID });
      } catch {
        /* user can switch manually via the button */
      }
    }
  }, [wrongNetwork, switchChain]);

  return (
    <>
      <header className="wallet-bar">
        <div className="brand">
          <span className="logo">🎲</span>
          <div>
            <h1>DLottery</h1>
            <p className="tagline">Decentralized on-chain lottery</p>
          </div>
        </div>

        <div className="wallet-actions">
          {isConnected ? (
            <>
              {/* FE-03: USD8 balance */}
              <div className="balance-pill" title="Your USD8 balance">
                <span className="balance-value">{formatUSD8(balance)}</span>
                <span className="balance-unit">USD8</span>
              </div>
              {/* FE-02: connected wallet address */}
              <div className="address-pill" title={address}>
                {shortAddress(address)}
              </div>
              {wrongNetwork && (
                <button
                  className="btn btn-warning"
                  onClick={() => switchChain({ chainId: CHAIN_ID })}
                >
                  Switch to {targetChain.name}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            // FE-01: connect a web3 wallet
            <button
              className="btn btn-primary"
              disabled={isPending || !injected}
              onClick={() => injected && connect({ connector: injected })}
            >
              {isPending ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {/* Full-width warning so actions can't be sent to the wrong network (e.g. mainnet). */}
      {wrongNetwork && (
        <div className="network-banner">
          ⚠️ Your wallet is on the wrong network (chain {chainId}). DLottery runs on{" "}
          <strong>{targetChain.name}</strong> (chain {CHAIN_ID}).{" "}
          <button className="link-btn" onClick={() => switchChain({ chainId: CHAIN_ID })}>
            Switch network
          </button>
        </div>
      )}
    </>
  );
}
