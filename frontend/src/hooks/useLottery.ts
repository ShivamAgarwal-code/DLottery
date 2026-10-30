import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { DLotteryAbi, LOTTERY_ADDRESS, USD8Abi, USD8_ADDRESS } from "../config";
import type { Address } from "viem";

export interface Draw {
  id: bigint;
  startTime: bigint;
  endTime: bigint;
  ticketPrice: bigint;
  participantCount: bigint;
  rollover: bigint;
  totalPool: bigint;
  daoFee: bigint;
  winnerPrize: bigint;
  luckyNumber: number;
  minParticipants: number;
  winner: Address;
  status: number;
  prizeClaimed: boolean;
}

const lottery = { address: LOTTERY_ADDRESS, abi: DLotteryAbi } as const;

/**
 * Reads the live current draw and derived state directly from the contract (PRD 4.2).
 * Polls every 5s so the dashboard stays fresh (countdown, new tickets, settlement).
 */
export function useCurrentDraw() {
  const { address } = useAccount();

  const base = useReadContracts({
    contracts: [
      { ...lottery, functionName: "getCurrentDraw" },
      { ...lottery, functionName: "isDrawEligible" },
      { ...lottery, functionName: "timeRemaining" },
    ],
    query: { refetchInterval: 5000 },
  });

  const draw = base.data?.[0]?.result as Draw | undefined;
  const isEligible = Boolean(base.data?.[1]?.result);
  const timeRemaining = Number((base.data?.[2]?.result as bigint | undefined) ?? 0n);
  const drawId = draw?.id;

  // Heterogeneous multicall (different functionName/args per item); wagmi's tuple
  // inference is bypassed with an untyped array and results are cast below.
  const extraContracts: any[] = [];
  if (drawId) {
    extraContracts.push({ ...lottery, functionName: "getAllocation", args: [drawId] });
    if (address) {
      extraContracts.push({ ...lottery, functionName: "ticketOf", args: [drawId, address] });
    }
  }
  const extra = useReadContracts({
    contracts: extraContracts,
    query: { enabled: Boolean(drawId), refetchInterval: 5000 },
  });

  const allocation = (extra.data?.[0]?.result as Address[] | undefined) ?? [];
  const myTicket = address ? Number((extra.data?.[1]?.result as number | undefined) ?? 0) : 0;

  const refetch = () => {
    void base.refetch();
    void extra.refetch();
  };

  return {
    draw,
    allocation,
    myTicket,
    isEligible,
    timeRemaining,
    isLoading: base.isLoading,
    error: base.error,
    refetch,
  };
}

/** USD8 balance + allowance for the connected account (FE-03, PRD 4.3 steps 1-2). */
export function useUSD8(owner?: Address) {
  const result = useReadContracts({
    contracts: owner
      ? [
          { address: USD8_ADDRESS, abi: USD8Abi, functionName: "balanceOf", args: [owner] },
          {
            address: USD8_ADDRESS,
            abi: USD8Abi,
            functionName: "allowance",
            args: [owner, LOTTERY_ADDRESS],
          },
        ]
      : [],
    query: { enabled: Boolean(owner), refetchInterval: 5000 },
  });

  const balance = (result.data?.[0]?.result as bigint | undefined) ?? 0n;
  const allowance = (result.data?.[1]?.result as bigint | undefined) ?? 0n;
  return { balance, allowance, refetch: result.refetch, isLoading: result.isLoading };
}

/** Whether the connected account already claimed a refund for a draw. */
export function useRefundClaimed(drawId?: bigint, account?: Address) {
  return useReadContract({
    ...lottery,
    functionName: "refundClaimed",
    args: drawId && account ? [drawId, account] : undefined,
    query: { enabled: Boolean(drawId && account), refetchInterval: 5000 },
  });
}
