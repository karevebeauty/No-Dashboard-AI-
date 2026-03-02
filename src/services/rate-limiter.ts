import { config } from '../config';
import { logger } from '../utils/logger';
import { RateLimitInfo } from '../types';

interface RateBucket {
  count: number;
  windowStart: Date;
}

export class RateLimiter {
  private minuteBuckets: Map<string, RateBucket> = new Map();
  private hourBuckets: Map<string, RateBucket> = new Map();
  private dayBuckets: Map<string, RateBucket> = new Map();
  private activeConcurrent: Map<string, number> = new Map();

  async checkLimit(phoneNumber: string): Promise<RateLimitInfo> {
    const now = new Date();

    // Check per-minute limit
    const minuteCheck = this.checkBucket(
      this.minuteBuckets,
      phoneNumber,
      config.rateLimits.perMinute,
      60 * 1000,
      now
    );
    if (minuteCheck.isLimited) {
      logger.warn('Per-minute rate limit hit', { phoneNumber: this.mask(phoneNumber) });
      return minuteCheck;
    }

    // Check per-hour limit
    const hourCheck = this.checkBucket(
      this.hourBuckets,
      phoneNumber,
      config.rateLimits.perHour,
      60 * 60 * 1000,
      now
    );
    if (hourCheck.isLimited) {
      logger.warn('Per-hour rate limit hit', { phoneNumber: this.mask(phoneNumber) });
      return hourCheck;
    }

    // Check per-day limit
    const dayCheck = this.checkBucket(
      this.dayBuckets,
      phoneNumber,
      config.rateLimits.perDay,
      24 * 60 * 60 * 1000,
      now
    );
    if (dayCheck.isLimited) {
      logger.warn('Per-day rate limit hit', { phoneNumber: this.mask(phoneNumber) });
      return dayCheck;
    }

    // Check concurrent requests
    const concurrent = this.activeConcurrent.get(phoneNumber) || 0;
    if (concurrent >= config.rateLimits.concurrentRequests) {
      logger.warn('Concurrent request limit hit', { phoneNumber: this.mask(phoneNumber), concurrent });
      return {
        phoneNumber,
        requestCount: concurrent,
        windowStart: now,
        windowEnd: now,
        isLimited: true,
      };
    }

    // Increment all counters
    this.incrementBucket(this.minuteBuckets, phoneNumber, now);
    this.incrementBucket(this.hourBuckets, phoneNumber, now);
    this.incrementBucket(this.dayBuckets, phoneNumber, now);
    this.activeConcurrent.set(phoneNumber, concurrent + 1);

    return {
      phoneNumber,
      requestCount: minuteCheck.requestCount + 1,
      windowStart: minuteCheck.windowStart,
      windowEnd: new Date(minuteCheck.windowStart.getTime() + 60 * 1000),
      isLimited: false,
    };
  }

  releaseRequest(phoneNumber: string): void {
    const current = this.activeConcurrent.get(phoneNumber) || 0;
    if (current > 0) {
      this.activeConcurrent.set(phoneNumber, current - 1);
    }
  }

  private checkBucket(
    buckets: Map<string, RateBucket>,
    phoneNumber: string,
    limit: number,
    windowMs: number,
    now: Date
  ): RateLimitInfo {
    const bucket = buckets.get(phoneNumber);

    if (!bucket || now.getTime() - bucket.windowStart.getTime() > windowMs) {
      // Window expired, reset
      return {
        phoneNumber,
        requestCount: 0,
        windowStart: now,
        windowEnd: new Date(now.getTime() + windowMs),
        isLimited: false,
      };
    }

    return {
      phoneNumber,
      requestCount: bucket.count,
      windowStart: bucket.windowStart,
      windowEnd: new Date(bucket.windowStart.getTime() + windowMs),
      isLimited: bucket.count >= limit,
    };
  }

  private incrementBucket(
    buckets: Map<string, RateBucket>,
    phoneNumber: string,
    now: Date
  ): void {
    const bucket = buckets.get(phoneNumber);
    if (bucket) {
      bucket.count++;
    } else {
      buckets.set(phoneNumber, { count: 1, windowStart: now });
    }
  }

  private mask(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    return `***${cleaned.slice(-4)}`;
  }
}
