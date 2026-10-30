import { useEffect, useMemo, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";
import {
  DLotteryAbi,
  LOTTERY_ADDRESS,
  USD8Abi,
  USD8_ADDRESS,
  DrawStatus,
  CHAIN_ID,
} from "../config";
import type { Draw } from "../hooks/useLottery";
import { formatUSD8, isZeroAddress } from "../lib/format";

interface Props {
  draw: Draw;
  allocation: Address[];
  myTicket: number;
  balance: bigint;
  allowance: bigint;
  timeRemaining: number;
  onChanged: () => void;
}

/**
 * Ticket purchase flow (PRD 4.3 / 5.2):
 *  1. check USD8 balance  2. check allowance  3. approve if needed
 *  4. submit purchase  5. show tx status  6. show assigned number
 *  7. prevent a second purchase from the same wallet (FE-04).
 */
export function BuyTicket({
  draw,
  allocation,
  myTicket,
  balance,
  allowance,
  timeRemaining,
  onChanged,
}: Props) {
  const freeNumbers = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => i + 1).filter((n) => isZeroAddress(allocation[n - 1])),
    [allocation]
  );
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (selected === null && freeNumbers.length > 0) setSelected(freeNumbers[0]);
    if (selected !== null && !freeNumbers.includes(selected)) {
      setSelected(freeNumbers[0] ?? null);
    }
  }, [freeNumbers, selected]);

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const buy = useWriteContract();
  const buyReceipt = useWaitForTransactionReceipt({ hash: buy.data });

  // Refresh parent state once a tx confirms (updates allowance / assigned number).
  useEffect(() => {
    if (approveReceipt.isSuccess) onChanged();
  }, [approveReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (buyReceipt.isSuccess) onChanged();
  }, [buyReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 7 / FE-04: already participating.
  if (myTicket !== 0) {
    return (
      <div className="card purchase">
        <h3>Your Ticket</h3>
        <div className="my-ticket">
          <span className="my-ticket-number">{myTicket}</span>
          <p>You're in this draw. One ticket per wallet - good luck! 🍀</p>
        </div>
      </div>
    );
  }

  const isActive = draw.status === DrawStatus.Active;
  const isFull = draw.participantCount >= 5n;
  const isExpired = timeRemaining <= 0;
  const canBuy = isActive && !isFull && !isExpired;

  const insufficientBalance = balance < draw.ticketPrice;
  const needApproval = allowance < draw.ticketPrice;

  const approving = approve.isPending || approveReceipt.isLoading;
  const buying = buy.isPending || buyReceipt.isLoading;

  const handleApprove = () => {
    approve.writeContract({
      chainId: CHAIN_ID,
      address: USD8_ADDRESS,
      abi: USD8Abi,
      functionName: "approve",
      args: [LOTTERY_ADDRESS, draw.ticketPrice],
    });
  };

  const handleBuy = () => {
    if (selected === null) return;
    buy.writeContract({
      chainId: CHAIN_ID,
      address: LOTTERY_ADDRESS,
      abi: DLotteryAbi,
      functionName: "buyTicket",
      args: [selected],
    });
  };

  return (
    <div className="card purchase">
      <h3>Buy a Ticket</h3>

      {!canBuy && (
        <p className="notice">
          {!isActive
            ? "This draw is not accepting tickets."
            : isFull
              ? "This draw is full (5/5)."
              : "The 24-hour window has closed."}
        </p>
      )}

      {/* Steps 1-2: balance & allowance checks */}
      <ul className="checklist">
        <li className={insufficientBalance ? "fail" : "ok"}>
          Balance: {formatUSD8(balance)} USD8 (need {formatUSD8(draw.ticketPrice)})
        </li>
        <li className={needApproval ? "pending" : "ok"}>
          Allowance: {needApproval ? "approval required" : "sufficient"}
        </li>
      </ul>

      {canBuy && (
        <>
          <label className="field-label">Choose your number</label>
          <div className="number-picker">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const free = freeNumbers.includes(n);
              return (
                <button
                  key={n}
                  className={`num-btn ${selected === n ? "selected" : ""} ${free ? "" : "disabled"}`}
                  disabled={!free}
                  onClick={() => setSelected(n)}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {/* Steps 3-4: approve then buy */}
          {needApproval ? (
            <button
              className="btn btn-primary full"
              disabled={approving || insufficientBalance}
              onClick={handleApprove}
            >
              {approving ? "Approving USD8…" : `Approve ${formatUSD8(draw.ticketPrice)} USD8`}
            </button>
          ) : (
            <button
              className="btn btn-primary full"
              disabled={buying || insufficientBalance || selected === null}
              onClick={handleBuy}
            >
              {buying ? "Purchasing…" : `Buy Ticket #${selected ?? "-"}`}
            </button>
          )}
        </>
      )}

      {/* Step 5: transaction status */}
      <TxStatus label="Approval" hash={approve.data} error={approve.error} receipt={approveReceipt} />
      <TxStatus label="Purchase" hash={buy.data} error={buy.error} receipt={buyReceipt} />
    </div>
  );
}

function TxStatus({
  label,
  hash,
  error,
  receipt,
}: {
  label: string;
  hash?: `0x${string}`;
  error: Error | null;
  receipt: { isLoading: boolean; isSuccess: boolean };
}) {
  if (error) {
    return <p className="tx-status error">{label} failed: {shortError(error)}</p>;
  }
  if (!hash) return null;
  if (receipt.isLoading) return <p className="tx-status pending">{label} pending… {hash.slice(0, 10)}…</p>;
  if (receipt.isSuccess) return <p className="tx-status ok">{label} confirmed ✓</p>;
  return null;
}

function shortError(e: Error): string {
  const msg = e.message || "unknown error";
  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}
