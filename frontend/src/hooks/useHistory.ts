import { useQuery } from "@tanstack/react-query";
import { BACKEND_URL } from "../config";

export interface HistoryDraw {
  draw_id: number;
  status: string;
  start_time: number;
  end_time: number;
  ticket_price: string;
  participant_count: number;
  lucky_number: number | null;
  winner_address: string | null;
  total_prize_pool: string;
  dao_fee: string;
  winner_prize: string;
  rollover: string;
  min_participants: number;
  prize_claimed: boolean;
}

export interface HistoryResponse {
  page: number;
  page_size: number;
  total: number;
  draws: HistoryDraw[];
}

/** Paginated draw history served by the backend indexer (PRD 3.4, 4.6). */
export function useHistory(page: number, pageSize = 10) {
  return useQuery<HistoryResponse>({
    queryKey: ["history", page, pageSize],
    queryFn: async () => {
      const res = await fetch(
        `${BACKEND_URL}/api/v1/draws/history?page=${page}&page_size=${pageSize}`
      );
      if (!res.ok) throw new Error(`history request failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: 10000,
    retry: 1,
  });
}
