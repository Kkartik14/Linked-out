import { Injectable } from '@nestjs/common';

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
  private requestCount = 0;

  constructor(private readonly repository: RateLimitRepository) {}

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

      await this.refill(request, nowMs, lease);
    }
  }

  private pruneExpiredLeases(nowMs: number): void {
    this.requestCount += 1;
    if (this.requestCount % 1000 !== 0) return;

    for (const [key, lease] of this.leases) {
      if (lease.resetAt <= nowMs) this.leases.delete(key);
    }
  }

  private currentLease(request: RateLimitRequest, nowMs: number): LocalLease | undefined {
    const lease = this.leases.get(request.key);
    if (
      lease &&
      (lease.resetAt <= nowMs || lease.limit !== request.limit || lease.windowMs !== request.windowMs)
    ) {
      this.leases.delete(request.key);
      return undefined;
    }
    return lease;
  }

  private async refill(
    request: RateLimitRequest,
    nowMs: number,
    current: LocalLease | undefined,
  ): Promise<void> {
    const pending = this.refills.get(request.key);
    if (pending) {
      await pending;
      return;
    }

    const refill = this.reserve(request, nowMs, current).finally(() => {
      if (this.refills.get(request.key) === refill) this.refills.delete(request.key);
    });
    this.refills.set(request.key, refill);
    await refill;
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
