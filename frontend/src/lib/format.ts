import { formatUnits } from "viem";
import { DrawStatus, USD8_DECIMALS } from "../config";

export function formatUSD8(value: bigint | string | undefined | null, dp = 2): string {
  if (value === undefined || value === null) return "0";
  const v = typeof value === "string" ? BigInt(value) : value;
  const s = formatUnits(v, USD8_DECIMALS);
  // Trim to `dp` decimals without rounding surprises for whole numbers.
  const num = Number(s);
  if (Number.isInteger(num)) return num.toString();
  return num.toLocaleString(undefined, { maximumFractionDigits: dp });
}

export function shortAddress(addr?: string | null): string {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function statusLabel(status: DrawStatus | number): string {
  switch (status) {
    case DrawStatus.Active:
      return "Active";
    case DrawStatus.Completed:
      return "Completed";
    case DrawStatus.NoWinner:
      return "No winner";
    case DrawStatus.Cancelled:
      return "Cancelled";
    default:
      return "Unknown";
  }
}

export function statusClass(status: DrawStatus | number): string {
  switch (status) {
    case DrawStatus.Active:
      return "badge badge-active";
    case DrawStatus.Completed:
      return "badge badge-completed";
    case DrawStatus.NoWinner:
      return "badge badge-nowinner";
    case DrawStatus.Cancelled:
      return "badge badge-cancelled";
    default:
      return "badge";
  }
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "Closed";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatTimestamp(unixSeconds: number | bigint): string {
  const n = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  if (!n) return "-";
  return new Date(n * 1000).toLocaleString();
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isZeroAddress(addr?: string | null): boolean {
  return !addr || addr.toLowerCase() === ZERO_ADDRESS;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
