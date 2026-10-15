import { describe, expect, it } from "vitest";
import { defaultFailoverPolicy, validFailoverPolicy, validRetryStatusCodes } from "./failoverPolicy";

describe("aggregate failover validation", () => {
  it("accepts bounded defaults, an empty status list, and disabling failover", () => {
    expect(validFailoverPolicy(defaultFailoverPolicy())).toBe(true);
    expect(validFailoverPolicy({ ...defaultFailoverPolicy(), enabled: false, retryStatusCodes: [] })).toBe(true);
    expect(validFailoverPolicy({ ...defaultFailoverPolicy(), maxAttempts: 20, failureThreshold: 10,
      initialCooldownSeconds: 300, maxCooldownSeconds: 3600 })).toBe(true);
  });

  it.each([
    { maxAttempts: 0 }, { maxAttempts: 21 }, { maxAttempts: 1.5 }, { failureThreshold: 11 },
    { initialCooldownSeconds: 301 }, { initialCooldownSeconds: 0 }, { maxCooldownSeconds: 3601 },
    { initialCooldownSeconds: 20, maxCooldownSeconds: 19 },
    { recoverySuccessThreshold: 0 }, { recoverySuccessThreshold: 11 },
    { errorRateThresholdPercent: 0 }, { errorRateThresholdPercent: 101 },
    { errorRateMinRequests: 0 }, { errorRateMinRequests: 101 },
  ])("rejects invalid policy boundaries: %j", (override) => {
    expect(validFailoverPolicy({ ...defaultFailoverPolicy(), ...override })).toBe(false);
  });

  it.each([[399], [600], [429.1], [429, 429], Array.from({ length: 33 }, (_, index) => 400 + index)])(
    "rejects invalid retry codes: %j", (...codes) => expect(validRetryStatusCodes(codes)).toBe(false),
  );
});
