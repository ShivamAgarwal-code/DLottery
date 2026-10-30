import { useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { DLotteryAbi, LOTTERY_ADDRESS, CHAIN_ID } from "../config";

interface Props {
  onChanged: () => void;
}

/**
 * Perform Lottery Draw action (PRD 4.4). Shown when the draw is eligible (full or the
 * 24-hour window elapsed). Displays a loading animation, waits for confirmation, then the
 * parent re-reads state to render the final result.
 */
export function PerformDraw({ onChanged }: Props) {
  const draw = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: draw.data });

  useEffect(() => {
    if (receipt.isSuccess) onChanged();
  }, [receipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = draw.isPending || receipt.isLoading;

  return (
    <div className="card draw-action">
      <h3>Ready to Draw</h3>
      <p>The round is eligible for settlement. Trigger the on-chain draw to reveal the lucky number.</p>

      <button
        className="btn btn-primary full"
        disabled={busy}
        onClick={() =>
          draw.writeContract({
            chainId: CHAIN_ID,
            address: LOTTERY_ADDRESS,
            abi: DLotteryAbi,
            functionName: "performDraw",
          })
        }
      >
        {busy ? (
          <span className="spinner-row">
            <span className="spinner" /> Drawing the lucky number…
          </span>
        ) : (
          "🎲 Perform Lottery Draw"
        )}
      </button>

      {draw.error && <p className="tx-status error">Draw failed: {draw.error.message.slice(0, 120)}</p>}
      {receipt.isLoading && <p className="tx-status pending">Awaiting blockchain confirmation…</p>}
    </div>
  );
}
