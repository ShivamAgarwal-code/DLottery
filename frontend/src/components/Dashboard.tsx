import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useCurrentDraw, useUSD8 } from "../hooks/useLottery";
import { DrawStatus } from "../config";
import { formatUSD8, statusLabel, statusClass } from "../lib/format";
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
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <span className="spinner-row">
          <span className="spinner" /> Loading current draw…
        </span>
      </div>
    );
  }

  const isActive = draw.status === DrawStatus.Active;
  const pool = isActive ? draw.rollover + draw.participantCount * draw.ticketPrice : draw.totalPool;
  const participants = Number(draw.participantCount);
  const pct = Math.min(100, (participants / 5) * 100);

  return (
    <div className="dashboard">
      {/* Hero prize */}
      <section className="hero">
        <div className="hero-top">
          <span className="hero-draw-id">Draw #{draw.id.toString()}</span>
          <span className={statusClass(draw.status)}>{statusLabel(draw.status)}</span>
        </div>

        <div className="hero-label">Current Prize Pool</div>
        <div className="hero-prize">
          {formatUSD8(pool)}
          <span className="unit">USD8</span>
        </div>
        <div className="hero-sub">
          {formatUSD8(draw.rollover)} USD8 rolled over · {formatUSD8(draw.ticketPrice)} USD8 per ticket
        </div>

        {isActive ? (
          <Countdown seconds={remaining} />
        ) : (
          <div className="countdown-closed">Draw closed</div>
        )}

        <div className="progress-wrap">
          <div className="progress-meta">
            <span>{participants} / 5 players</span>
            <span>min {draw.minParticipants} to settle</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="hero-chips">
          <Chip label="Ticket" value={`${formatUSD8(draw.ticketPrice)} USD8`} />
          <Chip label="Players" value={`${participants}/5`} />
          <Chip label="Rollover" value={`${formatUSD8(draw.rollover)}`} />
          <Chip label="Numbers" value="1-10" />
        </div>
      </section>

      {/* Allocation + action */}
      <div className="main-grid">
        <AllocationTable allocation={allocation} myAddress={address} />

        <div>
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
            ) : (
              <div className="card">
                <h3>Draw settling</h3>
                <p className="notice">This draw has closed. The result appears below.</p>
              </div>
            )
          ) : (
            <div className="card connect-prompt">
              <div className="big-emoji">🔐</div>
              <h3>Connect to play</h3>
              <p>Connect your wallet to buy a ticket and join the draw.</p>
            </div>
          )}
        </div>
      </div>

      {/* Result / refund view for the most recent settled draw (PRD 4.5) */}
      <LatestResult currentDrawId={draw.id} account={address} onChanged={refreshAll} />
    </div>
  );
}

function Countdown({ seconds }: { seconds: number }) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (seconds <= 0) return <div className="countdown-closed">Window closed - ready to draw</div>;
  return (
    <div className="countdown">
      <Box num={pad(h)} unit="hrs" />
      <Box num={pad(m)} unit="min" />
      <Box num={pad(s)} unit="sec" />
    </div>
  );
}

function Box({ num, unit }: { num: string; unit: string }) {
  return (
    <div className="count-box">
      <div className="count-num">{num}</div>
      <span className="count-unit">{unit}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="chip">
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
    </div>
  );
}
