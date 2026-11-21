import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllByIds } from "@/lib/supabase-batch";
import { fetchTicketCoverCounts } from "./ticket-cover-counts";

vi.mock("@/lib/supabase-batch", () => ({ fetchAllByIds: vi.fn() }));

describe("ticket history cover counts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one batched lookup and preserves per-sale counts above 1000 covers", async () => {
    vi.mocked(fetchAllByIds).mockResolvedValue([
      ...Array.from({ length: 1001 }, () => ({ ticket_sale_id: "sale-a" })),
      { ticket_sale_id: "sale-b" },
      { ticket_sale_id: "sale-b" },
      { ticket_sale_id: null },
    ]);
    const counts = await fetchTicketCoverCounts(["sale-a", "sale-b", "sale-c", "sale-a"]);
    expect(fetchAllByIds).toHaveBeenCalledExactlyOnceWith(
      "pickup_tokens", "ticket_sale_id", ["sale-a", "sale-b", "sale-c"], "ticket_sale_id"
    );
    expect(counts.get("sale-a")).toBe(1001);
    expect(counts.get("sale-b")).toBe(2);
    expect(counts.get("sale-c") ?? 0).toBe(0);
  });

  it("does not request tokens when no sales are visible", async () => {
    expect((await fetchTicketCoverCounts([])).size).toBe(0);
    expect(fetchAllByIds).not.toHaveBeenCalled();
  });

  it("propagates a failed lookup instead of showing incorrect zero counts", async () => {
    vi.mocked(fetchAllByIds).mockRejectedValue(new Error("lookup failed"));
    await expect(fetchTicketCoverCounts(["sale-a"])).rejects.toThrow("lookup failed");
  });
});