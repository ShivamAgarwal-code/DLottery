import { useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import type { Address } from "viem";
import { DLotteryAbi, LOTTERY_ADDRESS } from "../config";
import type { Draw } from "../hooks/useLottery";
import { formatUSD8 } from "../lib/format";

interface Props {
  draw: Draw;
  account?: Address;
  onChanged: () => void;
}

/** Refund view for a cancelled draw (PRD 4.5 / 5.3), SC-25..26. */
export function RefundView({ draw, account, onChanged }: Props) {
  const myTicket = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: DLotteryAbi,
    functionName: "ticketOf",
    args: account ? [draw.id, account] : undefined,
    query: { enabled: Boolean(account) },
  });
  const refundClaimed = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: DLotteryAbi,
    functionName: "refundClaimed",
    args: account ? [draw.id, account] : undefined,
    query: { enabled: Boolean(account) },
  });

  const claim = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: claim.data });

  useEffect(() => {
    if (receipt.isSuccess) {
      void myTicket.refetch();
      void refundClaimed.refetch();
      onChanged();
    }
  }, [receipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const participated = Number((myTicket.data as number | undefined) ?? 0) !== 0;
  const alreadyClaimed = Boolean(refundClaimed.data);
  const busy = claim.isPending || receipt.isLoading;

  return (
    <div className="card result cancelled">
      <h3>Draw #{draw.id.toString()} — Cancelled</h3>
      <div className="result-grid">
        <Stat label="Status" value="Cancelled (insufficient participants)" />
        <Stat label="Participants" value={`${draw.participantCount.toString()} / min ${draw.minParticipants}`} />
        <Stat label="Your principal" value={`${formatUSD8(draw.ticketPrice)} USD8`} />
      </div>

      {!participated && <p className="notice">You did not participate in this draw.</p>}

      {participated && (
        <button
          className="btn btn-primary full"
          disabled={busy || alreadyClaimed}
          onClick={() =>
            claim.writeContract({
              address: LOTTERY_ADDRESS,
              abi: DLotteryAbi,
              functionName: "claimRefund",
              args: [draw.id],
            })
          }
        >
          {alreadyClaimed ? "Refund claimed ✓" : busy ? "Claiming…" : "Claim Refund"}
        </button>
      )}

      {/* Refund transaction status; action disabled after a successful claim (PRD 4.5). */}
      {receipt.isLoading && <p className="tx-status pending">Refund pending…</p>}
      {receipt.isSuccess && <p className="tx-status ok">Refund confirmed ✓</p>}
      {claim.error && <p className="tx-status error">Refund failed: {claim.error.message.slice(0, 120)}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
