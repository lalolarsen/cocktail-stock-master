import { afterEach, describe, expect, it, vi } from "vitest";
import { printBrowserBatch, printBrowserDocument } from "./browser-print";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  const frames: Array<{ contentWindow: EventTarget & { print: ReturnType<typeof vi.fn> }; remove: ReturnType<typeof vi.fn>; srcdoc: string }> = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {
    querySelector: () => null,
    createElement: () => {
      const win = Object.assign(new EventTarget(), { document: { fonts: { ready: Promise.resolve() }, images: [] }, focus: vi.fn(), print: vi.fn() });
      const frame = { contentWindow: win, style: {}, setAttribute: vi.fn(), remove: vi.fn(), srcdoc: "", onload: () => {} };
      frames.push(frame);
      return frame;
    },
    body: { appendChild: (frame: { onload: () => void }) => frame.onload() },
  });
  return frames;
}

describe("PC print lifecycle", () => {
  it("does not remove an open preview at eight seconds or start an overlapping job", async () => {
    vi.useFakeTimers(); const frames = setup();
    const first = printBrowserDocument("first");
    const second = printBrowserDocument("second");
    await vi.advanceTimersByTimeAsync(8000);
    expect(frames).toHaveLength(1);
    expect(frames[0].contentWindow.print).toHaveBeenCalledTimes(1);
    expect(frames[0].remove).not.toHaveBeenCalled();
    frames[0].contentWindow.dispatchEvent(new Event("afterprint"));
    expect(await first).toEqual({ success: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(frames).toHaveLength(2);
    frames[1].contentWindow.dispatchEvent(new Event("afterprint"));
    expect(await second).toEqual({ success: true });
    expect(frames[0].remove).toHaveBeenCalledTimes(1);
  });
  it("sends all pieces of a sale in one document and one print invocation", async () => {
    vi.useFakeTimers(); const frames = setup();
    const result = printBrowserBatch(["entry", "cover"], "");
    await vi.advanceTimersByTimeAsync(0);
    expect(frames).toHaveLength(1);
    expect(frames[0].srcdoc).toContain("entry");
    expect(frames[0].srcdoc).toContain("cover");
    expect(frames[0].contentWindow.print).toHaveBeenCalledTimes(1);
    frames[0].contentWindow.dispatchEvent(new Event("afterprint"));
    expect(await result).toEqual({ success: true });
  });
  it("returns a failure rather than invented success when printing throws", async () => {
    vi.useFakeTimers(); const frames = setup();
    const result = printBrowserDocument("cover");
    await Promise.resolve();
    frames[0].contentWindow.print.mockImplementation(() => { throw new Error("Printing disabled"); });
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toEqual({ success: false, error: "Printing disabled" });
    expect(frames[0].remove).toHaveBeenCalledTimes(1);
  });
});