import { useState } from "react";
import { useHistory } from "../hooks/useHistory";
import { formatUSD8, shortAddress, formatTimestamp } from "../lib/format";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  NO_WINNER: "No winner",
  CANCELLED: "Cancelled",
};

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "badge badge-active",
  COMPLETED: "badge badge-completed",
  NO_WINNER: "badge badge-nowinner",
  CANCELLED: "badge badge-cancelled",
};

/** Draw history (PRD 4.6) sourced from the backend indexer (PRD 3.4). */
export function History() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading, error } = useHistory(page, pageSize);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="card history">
      <div className="history-header">
        <h3>Draw History</h3>
        {data && <span className="muted">{data.total} draws</span>}
      </div>

      {error && (
        <p className="notice">
          Could not load history from the backend ({`${error}`}). Is the indexer running at the
          configured <code>VITE_BACKEND_URL</code>?
        </p>
      )}
      {isLoading && <p>Loading history…</p>}

      {data && data.draws.length === 0 && <p className="muted">No draws recorded yet.</p>}

      {data && data.draws.length > 0 && (
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Draw</th>
                <th>Status</th>
                <th>Started</th>
                <th>Lucky #</th>
                <th>Winner</th>
                <th>Total pool</th>
                <th>DAO fee</th>
                <th>Winner prize</th>
              </tr>
            </thead>
            <tbody>
              {data.draws.map((d) => (
                <tr key={d.draw_id}>
                  <td>#{d.draw_id}</td>
                  <td>
                    <span className={STATUS_CLASS[d.status] ?? "badge"}>
                      {STATUS_LABELS[d.status] ?? d.status}
                    </span>
                  </td>
                  <td>{formatTimestamp(d.start_time)}</td>
                  <td>{d.lucky_number ?? "-"}</td>
                  <td title={d.winner_address ?? ""}>
                    {d.winner_address ? shortAddress(d.winner_address) : "-"}
                  </td>
                  <td>{formatUSD8(d.total_prize_pool)}</td>
                  <td>{formatUSD8(d.dao_fee)}</td>
                  <td>{formatUSD8(d.winner_prize)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ← Prev
        </button>
        <span className="muted">
          Page {page} / {totalPages}
        </span>
        <button
          className="btn btn-ghost"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
