import { Inject, Injectable } from '@nestjs/common';

import {
  RateLimitRepository,
  type RateLimitReservation,
} from './rate-limit.repository';

export interface RateLimitRequest {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

interface LocalLease {
  remaining: number;
  resetAt: number;
  exhausted: boolean;
  nextReservationSize: number;
  limit: number;
  windowMs: number;
}

export interface RateLimiterOptions {
  maxLocalKeys?: number;
  reservedLocalKeys?: number;
  reservedKeyPrefixes?: readonly string[];
}

export const RATE_LIMITER_OPTIONS = Symbol('RATE_LIMITER_OPTIONS');
const DEFAULT_MAX_LOCAL_KEYS = 10_000;

/** Leases are at most 10% for normal buckets and never exceed ten permits. */
function maximumReservationSize(limit: number): number {
  return Math.max(1, Math.min(10, Math.floor(limit / 10)));
}

/**
 * Process-local permit cache backed by globally capped PostgreSQL reservations.
 *
 * A caller only learns whether this request may proceed. Lease sizing,
 * single-flight refill, rollover, and Retry-After calculation stay behind this
 * interface. A crashed process can strand its unused permits until rollover,
 * which is deliberately fail-closed: capacity may shrink, but the global limit
 * can never be exceeded.
 */
@Injectable()
export class RateLimiter {
  private readonly leases = new Map<string, LocalLease>();
  private readonly refills = new Map<string, Promise<void>>();
  private readonly regularKeys = new Set<string>();
  private readonly reservedKeys = new Set<string>();
  private readonly maxLocalKeys: number;
  private readonly reservedLocalKeys: number;
  private readonly reservedKeyPrefixes: readonly string[];
  private earliestRegularLeaseResetAt = Number.POSITIVE_INFINITY;
  private earliestReservedLeaseResetAt = Number.POSITIVE_INFINITY;
  private requestCount = 0;

  constructor(
    private readonly repository: RateLimitRepository,
    @Inject(RATE_LIMITER_OPTIONS) options: RateLimiterOptions = {},
  ) {
    this.maxLocalKeys = options.maxLocalKeys ?? DEFAULT_MAX_LOCAL_KEYS;
    this.reservedLocalKeys = options.reservedLocalKeys ?? 0;
    this.reservedKeyPrefixes = Object.freeze([...(options.reservedKeyPrefixes ?? [])]);
    if (
      !Number.isSafeInteger(this.maxLocalKeys) ||
      this.maxLocalKeys <= 0 ||
      !Number.isSafeInteger(this.reservedLocalKeys) ||
      this.reservedLocalKeys < 0 ||
      this.reservedLocalKeys >= this.maxLocalKeys ||
      (this.reservedLocalKeys > 0 && this.reservedKeyPrefixes.length === 0) ||
      (this.reservedLocalKeys === 0 && this.reservedKeyPrefixes.length > 0) ||
      this.reservedKeyPrefixes.some((prefix) => prefix.length === 0) ||
      new Set(this.reservedKeyPrefixes).size !== this.reservedKeyPrefixes.length
    ) {
      throw new TypeError('Rate-limiter local key limits must be valid.');
    }
  }

  async take(request: RateLimitRequest): Promise<RateLimitDecision> {
    this.assertRequest(request);
    const nowMs = request.nowMs ?? Date.now();
    this.pruneExpiredLeases(nowMs);

    for (;;) {
      const lease = this.currentLease(request, nowMs);
      if (lease?.remaining) {
        lease.remaining -= 1;
        return { allowed: true };
      }

      if (lease?.exhausted) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((lease.resetAt - nowMs) / 1000)),
        };
      }

      if (!(await this.refill(request, nowMs, lease))) {
        return {
          allowed: false,
          retryAfterSeconds: this.capacityRetryAfterSeconds(request, nowMs),
        };
      }
    }
  }

  private pruneExpiredLeases(nowMs: number): void {
    this.requestCount += 1;
    if (this.requestCount % 1000 !== 0) return;

    this.removeExpiredLeases(nowMs);
  }

  private removeExpiredLeases(nowMs: number): void {
    if (
      Math.min(this.earliestRegularLeaseResetAt, this.earliestReservedLeaseResetAt) > nowMs
    ) {
      return;
    }

    let earliestRegularResetAt = Number.POSITIVE_INFINITY;
    let earliestReservedResetAt = Number.POSITIVE_INFINITY;
    for (const [key, lease] of this.leases) {
      if (lease.resetAt <= nowMs) {
        this.leases.delete(key);
        if (!this.refills.has(key)) this.untrackKey(key);
      } else {
        if (this.isReservedKey(key)) {
          earliestReservedResetAt = Math.min(earliestReservedResetAt, lease.resetAt);
        } else {
          earliestRegularResetAt = Math.min(earliestRegularResetAt, lease.resetAt);
        }
      }
    }
    this.earliestRegularLeaseResetAt = earliestRegularResetAt;
    this.earliestReservedLeaseResetAt = earliestReservedResetAt;
  }

  private currentLease(request: RateLimitRequest, nowMs: number): LocalLease | undefined {
    const lease = this.leases.get(request.key);
    if (
      lease &&
      (lease.resetAt <= nowMs || lease.limit !== request.limit || lease.windowMs !== request.windowMs)
    ) {
      this.leases.delete(request.key);
      if (!this.refills.has(request.key)) this.untrackKey(request.key);
      if (this.isReservedKey(request.key)) {
        if (lease.resetAt === this.earliestReservedLeaseResetAt) {
          this.earliestReservedLeaseResetAt = nowMs;
        }
      } else if (lease.resetAt === this.earliestRegularLeaseResetAt) {
        this.earliestRegularLeaseResetAt = nowMs;
      }
      return undefined;
    }
    return lease;
  }

  private async refill(
    request: RateLimitRequest,
    nowMs: number,
    current: LocalLease | undefined,
  ): Promise<boolean> {
    const pending = this.refills.get(request.key);
    if (pending) {
      await pending;
      return true;
    }

    if (!this.hasCapacityFor(request.key, nowMs)) return false;

    const refill = this.reserve(request, nowMs, current);
    this.refills.set(request.key, refill);
    try {
      await refill;
      return true;
    } finally {
      if (this.refills.get(request.key) === refill) this.refills.delete(request.key);
      if (!this.leases.has(request.key)) this.untrackKey(request.key);
    }
  }

  private hasCapacityFor(key: string, nowMs: number): boolean {
    if (this.isTracked(key)) return true;

    this.removeExpiredLeases(nowMs);
    const reserved = this.isReservedKey(key);
    const hasCapacity = reserved
      ? this.reservedKeys.size < this.reservedLocalKeys
      : this.regularKeys.size < this.maxLocalKeys - this.reservedLocalKeys;
    if (!hasCapacity) return false;
    (reserved ? this.reservedKeys : this.regularKeys).add(key);
    return true;
  }

  private isReservedKey(key: string): boolean {
    return this.reservedKeyPrefixes.some((prefix) => key.startsWith(prefix));
  }

  private isTracked(key: string): boolean {
    return this.regularKeys.has(key) || this.reservedKeys.has(key);
  }

  private untrackKey(key: string): void {
    this.regularKeys.delete(key);
    this.reservedKeys.delete(key);
  }

  private capacityRetryAfterSeconds(request: RateLimitRequest, nowMs: number): number {
    const poolResetAt = this.isReservedKey(request.key)
      ? this.earliestReservedLeaseResetAt
      : this.earliestRegularLeaseResetAt;
    const earliestResetAt = Math.min(poolResetAt, nowMs + request.windowMs);
    return Math.max(1, Math.ceil((earliestResetAt - nowMs) / 1000));
  }

  private async reserve(
    request: RateLimitRequest,
    nowMs: number,
    current: LocalLease | undefined,
  ): Promise<void> {
    const maximum = maximumReservationSize(request.limit);
    const permits = Math.min(current?.nextReservationSize ?? 1, maximum);
    const reservation = await this.repository.reservePermits({
      key: request.key,
      limit: request.limit,
      permits,
      windowMs: request.windowMs,
      nowMs,
    });
    this.assertReservation(reservation, permits, nowMs);

    this.leases.set(request.key, {
      remaining: reservation.granted,
      resetAt: reservation.resetAt,
      exhausted: reservation.exhausted || reservation.granted === 0,
      nextReservationSize: Math.min(maximum, permits * 2),
      limit: request.limit,
      windowMs: request.windowMs,
    });
    if (this.isReservedKey(request.key)) {
      this.earliestReservedLeaseResetAt = Math.min(
        this.earliestReservedLeaseResetAt,
        reservation.resetAt,
      );
    } else {
      this.earliestRegularLeaseResetAt = Math.min(
        this.earliestRegularLeaseResetAt,
        reservation.resetAt,
      );
    }
  }

  private assertRequest(request: RateLimitRequest): void {
    if (
      request.key.length === 0 ||
      !Number.isSafeInteger(request.limit) ||
      request.limit <= 0 ||
      !Number.isSafeInteger(request.windowMs) ||
      request.windowMs <= 0 ||
      (request.nowMs !== undefined && !Number.isSafeInteger(request.nowMs))
    ) {
      throw new TypeError('Rate-limit key, limit, windowMs, and nowMs must be valid.');
    }
  }

  private assertReservation(
    reservation: RateLimitReservation,
    requestedPermits: number,
    nowMs: number,
  ): void {
    if (
      !Number.isSafeInteger(reservation.granted) ||
      reservation.granted < 0 ||
      reservation.granted > requestedPermits ||
      !Number.isSafeInteger(reservation.resetAt) ||
      reservation.resetAt <= nowMs
    ) {
      throw new Error('Rate-limit repository returned an invalid permit reservation.');
    }
  }
}
