import { describe, expect, it, vi } from "vitest";
import { isInvalidCredentials, isSameUserSessionEvent, withAuthTimeout } from "./auth-flow";

describe("login recovery", () => {
  it("does not reload a cashier screen when the same user's tab refocuses or token refreshes", () => {
    expect(isSameUserSessionEvent("SIGNED_IN", "worker-a", "worker-a")).toBe(true);
    expect(isSameUserSessionEvent("TOKEN_REFRESHED", "worker-a", "worker-a")).toBe(true);
    expect(isSameUserSessionEvent("SIGNED_IN", "worker-a", "worker-b")).toBe(false);
    expect(isSameUserSessionEvent("SIGNED_IN", null, "worker-a")).toBe(false);
    expect(isSameUserSessionEvent("SIGNED_OUT", "worker-a", undefined)).toBe(false);
  });
  it("does not count network, disabled-provider or unconfirmed-account errors as wrong PINs", () => {
    expect(isInvalidCredentials({ code: "email_not_confirmed" })).toBe(false);
    expect(isInvalidCredentials({ code: "email_provider_disabled" })).toBe(false);
    expect(isInvalidCredentials({ message: "Failed to fetch" })).toBe(false);
    expect(isInvalidCredentials({ code: "invalid_credentials" })).toBe(true);
  });
  it("releases a login whose server request never completes", async () => {
    vi.useFakeTimers();
    try {
      const result = expect(withAuthTimeout(new Promise(() => {}), 15000)).rejects.toThrow("Revisa internet");
      await vi.advanceTimersByTimeAsync(15000);
      await result;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("preserves a successful response and clears its deadline", async () => {
    vi.useFakeTimers();
    try {
      await expect(withAuthTimeout(Promise.resolve({ id: "worker" }))).resolves.toEqual({ id: "worker" });
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});