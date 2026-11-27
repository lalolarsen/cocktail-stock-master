import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock("@/lib/venue", () => ({ DEFAULT_VENUE_ID: "test" }));
import { trackedPrint, subscribeFallback, dismissFallback, showManualFallback, clearManualFallback, type FallbackState } from "./print-tracker";
afterEach(() => { for (let i = 0; i < 10; i++) dismissFallback(); });
describe("failed print recovery", () => {
  it("preserves both pending covers rather than replacing the first with the next sale", () => {
    let current: FallbackState | null = null;
    const unsubscribe = subscribeFallback((state) => { current = state; });
    showManualFallback("Sale A", async () => {});
    showManualFallback("Sale B", async () => {});
    expect((current as FallbackState | null)?.label).toBe("Sale A");
    clearManualFallback("Sale A");
    expect((current as FallbackState | null)?.label).toBe("Sale B");
    unsubscribe();
  });
  it("catches a thrown printing error and retains the original sale for a manual attempt", async () => {
    const print = vi.fn().mockRejectedValueOnce(new Error("blocked")).mockResolvedValueOnce("sent");
    let current: FallbackState | null = null;
    const unsubscribe = subscribeFallback((state) => { current = state; });
    expect(await trackedPrint({ source: "ticket", refKey: "A", label: "Sale A", print })).toBe("not_sent");
    const pending = current as FallbackState | null;
    await pending?.retry();
    expect(print).toHaveBeenCalledTimes(2);
    expect(current).toBeNull();
    unsubscribe();
  });
  it("does not deliver the same cover twice during concurrent attempts", async () => {
    let finish: ((value: "sent") => void) | undefined;
    const print = vi.fn(() => new Promise<"sent">((resolve) => { finish = resolve; }));
    const opts = { source: "ticket" as const, refKey: "A", label: "Sale A", print };
    const a = trackedPrint(opts); const b = trackedPrint(opts);
    expect(print).toHaveBeenCalledTimes(1);
    finish?.("sent");
    expect(await a).toBe("sent"); expect(await b).toBe("sent");
  });
});