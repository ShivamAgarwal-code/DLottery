import type { Address } from "viem";
import { shortAddress, isZeroAddress, sameAddress } from "../lib/format";

interface Props {
  allocation: Address[]; // index i => owner of number (i+1)
  myAddress?: string;
  luckyNumber?: number; // highlight when settled
}

/**
 * Ticket number allocation table (PRD 4.2): lists numbers 1-10 with the wallet address
 * holding each number.
 */
export function AllocationTable({ allocation, myAddress, luckyNumber }: Props) {
  const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <div className="card allocation">
      <h3>Ticket Allocation · 1-10</h3>
      <div className="allocation-grid">
        {numbers.map((n) => {
          const owner = allocation[n - 1];
          const taken = !isZeroAddress(owner);
          const mine = sameAddress(owner, myAddress);
          const isLucky = luckyNumber === n;
          return (
            <div
              key={n}
              className={[
                "alloc-cell",
                taken ? "taken" : "free",
                mine ? "mine" : "",
                isLucky ? "lucky" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={taken ? owner : "Available"}
            >
              <span className="ball">{n}</span>
              <span className="alloc-owner">
                {taken ? (mine ? "You" : shortAddress(owner)) : "Open"}
              </span>
              {isLucky && <span className="alloc-lucky-tag">★ LUCKY</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
