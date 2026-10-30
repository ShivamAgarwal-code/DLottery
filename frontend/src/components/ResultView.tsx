import { useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";
import { DLotteryAbi, LOTTERY_ADDRESS, DrawStatus, CHAIN_ID } from "../config";
import type { Draw } from "../hooks/useLottery";
import { formatUSD8, shortAddress, sameAddress } from "../lib/format";

interface Props {
  draw: Draw;
  account?: Address;
  onChanged: () => void;
}

/** Winner / no-winner result views (PRD 4.5) with the prize claim action (SC-21..24). */
export function ResultView({ draw, account, onChanged }: Props) {
  const claim = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: claim.data });

  useEffect(() => {
    if (receipt.isSuccess) onChanged();
  }, [receipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const isWinnerDraw = draw.status === DrawStatus.Completed;
  const iAmWinner = sameAddress(draw.winner, account);
  const busy = claim.isPending || receipt.isLoading;

  if (!isWinnerDraw) {
    // No-winner result (PRD 4.5): lucky number, status, rollover, next-draw info.
    return (
      <div className="card result no-winner">
        <h3>Draw #{draw.id.toString()} - No Winner</h3>
        <div className="lucky-reveal">
          <span className="lucky-label">Lucky number</span>
          <span className="lucky-ball nowin">{draw.luckyNumber}</span>
        </div>
        <div className="result-grid">
          <Stat label="Status" value="No winner" />
          <Stat label="Total pool" value={`${formatUSD8(draw.totalPool)} USD8`} />
          <Stat label="Rolled over to next draw" value={`${formatUSD8(draw.totalPool)} USD8`} />
          <Stat label="Next draw" value={`#${(draw.id + 1n).toString()}`} />
        </div>
        <p className="notice">No ticket matched the lucky number - the pool rolls into the next draw.</p>
      </div>
    );
  }

  // Winner result (PRD 4.5): winner, lucky number, pool, DAO fee, claimable, claim action.
  return (
    <div className="card result winner">
      <h3>Draw #{draw.id.toString()} - We Have a Winner! 🎉</h3>
      <div className="lucky-reveal">
        <span className="lucky-label">Lucky number</span>
        <span className="lucky-ball win">{draw.luckyNumber}</span>
      </div>
      <div className="result-grid">
        <Stat label="Winner" value={iAmWinner ? "You 🏆" : shortAddress(draw.winner)} />
        <Stat label="Total prize pool" value={`${formatUSD8(draw.totalPool)} USD8`} />
        <Stat label="DAO fee (5%)" value={`${formatUSD8(draw.daoFee)} USD8`} />
        <Stat label="Winner claimable" value={`${formatUSD8(draw.winnerPrize)} USD8`} highlight />
      </div>

      {iAmWinner && !draw.prizeClaimed && (
        <button
          className="btn btn-primary full"
          disabled={busy}
          onClick={() =>
            claim.writeContract({
              chainId: CHAIN_ID,
              address: LOTTERY_ADDRESS,
              abi: DLotteryAbi,
              functionName: "claimPrize",
              args: [draw.id],
            })
          }
        >
          {busy ? "Claiming…" : `Claim ${formatUSD8(draw.winnerPrize)} USD8`}
        </button>
      )}
      {draw.prizeClaimed && <p className="tx-status ok">Prize claimed ✓</p>}
      {claim.error && <p className="tx-status error">Claim failed: {claim.error.message.slice(0, 120)}</p>}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`stat ${highlight ? "highlight" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
