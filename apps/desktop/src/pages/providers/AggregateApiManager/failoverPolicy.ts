import type { AggregateFailoverPolicy } from "../../../types";

export const FAILOVER_LIMITS = {
  maxAttempts: 20,
  failureThreshold: 10,
  initialCooldownSeconds: 300,
  maxCooldownSeconds: 3600,
  statusCodes: 32,
} as const;

export function defaultFailoverPolicy(): AggregateFailoverPolicy {
  return {
    enabled: true,
    maxAttempts: 3,
    failureThreshold: 2,
    initialCooldownSeconds: 5,
    maxCooldownSeconds: 60,
    retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
    retryOnNetworkErrors: true,
    respectRetryAfter: true,
  };
}

export function copyFailoverPolicy(policy?: AggregateFailoverPolicy): AggregateFailoverPolicy {
  return policy ? { ...policy, retryStatusCodes: [...policy.retryStatusCodes] } : defaultFailoverPolicy();
}

export function isFailoverInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maximum;
}

export function validRetryStatusCodes(codes: unknown): codes is number[] {
  return Array.isArray(codes) && codes.length <= FAILOVER_LIMITS.statusCodes
    && new Set(codes).size === codes.length
    && codes.every((code: unknown) => typeof code === "number" && Number.isInteger(code)
      && code >= 400 && code <= 599);
}

export function validFailoverPolicy(policy: AggregateFailoverPolicy): boolean {
  return typeof policy.enabled === "boolean"
    && typeof policy.retryOnNetworkErrors === "boolean"
    && typeof policy.respectRetryAfter === "boolean"
    && isFailoverInteger(policy.maxAttempts, FAILOVER_LIMITS.maxAttempts)
    && isFailoverInteger(policy.failureThreshold, FAILOVER_LIMITS.failureThreshold)
    && isFailoverInteger(policy.initialCooldownSeconds, FAILOVER_LIMITS.initialCooldownSeconds)
    && isFailoverInteger(policy.maxCooldownSeconds, FAILOVER_LIMITS.maxCooldownSeconds)
    && policy.maxCooldownSeconds >= policy.initialCooldownSeconds
    && validRetryStatusCodes(policy.retryStatusCodes);
}
