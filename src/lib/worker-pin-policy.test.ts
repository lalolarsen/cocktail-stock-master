import { describe, expect, it } from "vitest";
import { canResetWorkerPin } from "../../supabase/functions/_shared/worker-pin-policy";

describe("worker PIN reset permissions", () => {
  it("allows only an administrator of the worker's venue", () => {
    expect(canResetWorkerPin(["admin"], "berlin", "berlin")).toBe(true);
    expect(canResetWorkerPin(["vendedor"], "berlin", "berlin")).toBe(false);
    expect(canResetWorkerPin(["gerencia"], "berlin", "berlin")).toBe(false);
  });
  it("rejects other venues and missing venue assignment", () => {
    expect(canResetWorkerPin(["admin"], "berlin", "other")).toBe(false);
    expect(canResetWorkerPin(["admin"], null, null)).toBe(false);
  });
});