import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { DLotteryAbi, LOTTERY_ADDRESS, DrawStatus } from "../config";
import type { Draw } from "../hooks/useLottery";
import { ResultView } from "./ResultView";
import { RefundView } from "./RefundView";

interface Props {
  currentDrawId: bigint;
  account?: Address;
  onChanged: () => void;
}

/**
 * Shows the result of the most-recently-settled draw (currentDrawId - 1) so a user can
 * see the outcome and claim a prize/refund immediately after settlement (PRD 4.5).
 */
export function LatestResult({ currentDrawId, account, onChanged }: Props) {
  const prevId = currentDrawId > 1n ? currentDrawId - 1n : 0n;
  const prev = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: DLotteryAbi,
    functionName: "getDraw",
    args: prevId > 0n ? [prevId] : undefined,
    query: { enabled: prevId > 0n, refetchInterval: 8000 },
  });

  if (prevId === 0n || !prev.data) return null;
  const draw = prev.data as Draw;

  if (draw.status === DrawStatus.Completed || draw.status === DrawStatus.NoWinner) {
    return <ResultView draw={draw} account={account} onChanged={onChanged} />;
  }
  if (draw.status === DrawStatus.Cancelled) {
    return <RefundView draw={draw} account={account} onChanged={onChanged} />;
  }
  return null;
}
