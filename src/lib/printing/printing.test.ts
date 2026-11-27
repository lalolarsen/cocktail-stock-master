import { afterEach, describe, expect, it, vi } from "vitest";
import { sendToRawBt } from "./rawbt";
import { buildAlcoholRawBtPayload } from "./alcohol-rawbt";
import type { ReceiptData } from "./qz";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Android delivery detection", () => {
  function setup() {
    const win = new EventTarget();
    Object.assign(win, { location: { assign: vi.fn() }, setTimeout });
    const doc = new EventTarget();
    Object.assign(doc, { visibilityState: "visible" });
    vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
    return { win, doc };
  }
  it("does not report delivery merely because a chooser blurred the browser", async () => {
    vi.useFakeTimers(); const { win } = setup();
    const result = sendToRawBt("payload");
    win.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe("not_sent");
  });
  it("reports handoff when Android actually hides the application", async () => {
    vi.useFakeTimers(); const { doc } = setup();
    const result = sendToRawBt("payload");
    Object.assign(doc, { visibilityState: "hidden" });
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(await result).toBe("sent");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Alcohol RawBT job", () => {
  const data: ReceiptData = { saleNumber: "TEST-01", venueName: "Berlín", posName: "Caja", dateTime: "27/11/2026", items: [{ name: "Pisco", quantity: 2, price: 3000 }], total: 6000, paymentMethod: "cash", jornadaNumber: 157 };
  it("packs the cover and cashier receipt into a single payload with two cuts", () => {
    const raw = atob(buildAlcoholRawBtPayload(data));
    expect(raw).toContain("COVER\n");
    expect(raw).toContain("COMPROBANTE DEL VENDEDOR\n");
    expect(raw).toContain("2 x Pisco\n");
    expect(raw.split("\x1d\x56\x42\x00")).toHaveLength(3);
    expect(raw).toContain("JORNADA #157");
  });
  it("a receipt-only request does not issue another cover", () => {
    const raw = atob(buildAlcoholRawBtPayload(data, true));
    expect(raw).not.toContain("COVER\n");
    expect(raw.split("\x1d\x56\x42\x00")).toHaveLength(2);
  });
});