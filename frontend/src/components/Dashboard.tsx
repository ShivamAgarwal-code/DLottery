import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useCurrentDraw, useUSD8 } from "../hooks/useLottery";
import { DrawStatus } from "../config";
import { formatUSD8, formatDuration, statusLabel, statusClass } from "../lib/format";
import { AllocationTable } from "./AllocationTable";
import { BuyTicket } from "./BuyTicket";
import { PerformDraw } from "./PerformDraw";
import { LatestResult } from "./LatestResult";

/** Active draw dashboard (PRD 4.2) plus purchase/draw/result interactions. */
export function Dashboard() {
  const { address } = useAccount();
  const { draw, allocation, myTicket, isEligible, timeRemaining, isLoading, error, refetch } =
    useCurrentDraw();
  const usd8 = useUSD8(address);

  // Local countdown that ticks every second between 5s chain refreshes (PRD 4.2).
  const [remaining, setRemaining] = useState(timeRemaining);
  useEffect(() => setRemaining(timeRemaining), [timeRemaining]);
  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const refreshAll = () => {
    refetch();
    void usd8.refetch();
  };

  if (error) {
    return (
      <div className="card">
        <h3>Can't reach the contract</h3>
        <p className="notice">
          Could not read the lottery at the configured address. Check that your wallet is on the
          right network and that the contract is deployed.
        </p>
      </div>
    );
  }

  if (isLoading || !draw) {
    return <div className="card"><p>Loading current draw…</p></div>;
  }

  const isActive = draw.status === DrawStatus.Active;

  return (
    <div className="dashboard">
      <div className="card draw-summary">
        <div className="summary-header">
          <div>
            <span className="muted">Current Draw</span>
            <h2>#{draw.id.toString()}</h2>
          </div>
          <span className={statusClass(draw.status)}>{statusLabel(draw.status)}</span>
        </div>

        <div className="summary-stats">
          <Stat label="Ticket price" value={`${formatUSD8(draw.ticketPrice)} USD8`} />
          <Stat
            label="Participants"
            value={`${draw.participantCount.toString()} / 5`}
            sub={`min ${draw.minParticipants}`}
          />
          <Stat label="Prize pool" value={`${formatUSD8(poolSoFar(draw))} USD8`} sub={`rollover ${formatUSD8(draw.rollover)}`} />
          <Stat
            label="Time remaining"
            value={isActive ? formatDuration(remaining) : "—"}
          />
        </div>
      </div>

      <AllocationTable allocation={allocation} myAddress={address} />

      {/* Interaction area: buy, or draw when eligible */}
      {address ? (
        isActive ? (
          isEligible ? (
            <PerformDraw onChanged={refreshAll} />
          ) : (
            <BuyTicket
              draw={draw}
              allocation={allocation}
              myTicket={myTicket}
              balance={usd8.balance}
              allowance={usd8.allowance}
              timeRemaining={remaining}
              onChanged={refreshAll}
            />
          )
        ) : null
      ) : (
        <div className="card">
          <p className="notice">Connect your wallet to buy a ticket and take part in the draw.</p>
        </div>
      )}

      {/* Result / refund view for the most recent settled draw (PRD 4.5) */}
      <LatestResult currentDrawId={draw.id} account={address} onChanged={refreshAll} />
    </div>
  );
}

// Live pool estimate for an active draw = rollover + participants * ticketPrice.
function poolSoFar(draw: {
  rollover: bigint;
  participantCount: bigint;
  ticketPrice: bigint;
  totalPool: bigint;
  status: number;
}): bigint {
  if (draw.status !== DrawStatus.Active) return draw.totalPool;
  return draw.rollover + draw.participantCount * draw.ticketPrice;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="summary-stat">
      <span className="summary-stat-label">{label}</span>
      <span className="summary-stat-value">{value}</span>
      {sub && <span className="summary-stat-sub">{sub}</span>}
    </div>
  );
}
