import { fetchAllByIds } from "@/lib/supabase-batch";

/** Count every cover, including redeemed/cancelled tokens, just like history did. */
export async function fetchTicketCoverCounts(saleIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(saleIds)];
  if (ids.length === 0) return new Map();
  const tokens = await fetchAllByIds<{ ticket_sale_id: string | null }>(
    "pickup_tokens", "ticket_sale_id", ids, "ticket_sale_id"
  );
  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (token.ticket_sale_id === null) continue;
    counts.set(token.ticket_sale_id, (counts.get(token.ticket_sale_id) ?? 0) + 1);
  }
  return counts;
}