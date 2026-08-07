import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { createRedisClient } from '@/shared/redis/redis.factory';
import { ProactiveDetectorService } from './proactive-detector.service';
import { ProactiveExecutorService } from './proactive-executor.service';

const LOCK_KEY      = 'proactive-engine:cron-lock';
const LOCK_TTL_S    = 13 * 60; // 13min — shorter than the 15min cron interval
const DIGEST_LOCK   = 'proactive-engine:digest-lock';
const DIGEST_TTL_S  = 23 * 60 * 60; // 23h — fires once per day

@Injectable()
export class ProactiveEngineCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProactiveEngineCron.name);
  private redis: Redis | null = null;
  // MON-007/MON-008: stats expostos ao HealthController.
  static lastRunAt: Date | null = null;
  static lastDigestAt: Date | null = null;

  getStats() {
    return {
      lastRunAt: ProactiveEngineCron.lastRunAt?.toISOString() ?? null,
      lastDigestAt: ProactiveEngineCron.lastDigestAt?.toISOString() ?? null,
    };
  }

  constructor(
    private readonly detector: ProactiveDetectorService,
    private readonly executor: ProactiveExecutorService,
  ) {}

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = createRedisClient(url, 'proactive-engine');
    } else {
      this.logger.warn('[proactive-engine] REDIS_URL not set — distributed lock disabled');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }

  /** Runs every 15 minutes — detects rule violations and executes pending events. */
  @Cron('*/15 * * * *')
  async runCycle(): Promise<void> {
    if (!(await this.acquireLock(LOCK_KEY, LOCK_TTL_S))) {
      this.logger.debug('[proactive-engine] cron lock held by another instance — skipping');
      return;
    }
    try {
      this.logger.log('[proactive-engine] starting detection cycle');
      await this.detector.evaluateAll();
      await this.executor.executeAll();
      ProactiveEngineCron.lastRunAt = new Date();
      this.logger.log('[proactive-engine] cycle complete');
    } finally {
      // Same reason as acquireLock: a rejection inside a @Cron's finally is
      // unhandled and kills the process. The lock TTL releases it anyway.
      await this.redis
        ?.del(LOCK_KEY)
        .catch((err: any) => this.logger.warn(`[proactive-engine] failed to release lock (expires by TTL): ${err?.message}`));
    }
  }

  /** Runs daily at 18:00 (Brasília) — fires the digest rule for all tenants. */
  @Cron('0 21 * * *') // 21h UTC = 18h BRT
  async runDigest(): Promise<void> {
    if (!(await this.acquireLock(DIGEST_LOCK, DIGEST_TTL_S))) {
      this.logger.debug('[proactive-engine] digest lock held — skipping');
      return;
    }
    try {
      this.logger.log('[proactive-engine] running digest');
      await this.detector.evaluateDigest();
      await this.executor.executeAll();
      ProactiveEngineCron.lastDigestAt = new Date();
    } finally {
      // Lock is intentionally NOT released — keeps it for 23h so it won't double-fire today.
    }
  }

  private async acquireLock(key: string, ttlS: number): Promise<boolean> {
    if (!this.redis) return true; // no Redis → allow (single-instance mode)
    try {
      const result = await this.redis.set(key, '1', 'EX', ttlS, 'NX');
      return result === 'OK';
    } catch (err: any) {
      // Called from @Cron/@Interval handlers — an unhandled rejection here takes
      // the whole process down. Redis being unreachable is the same situation as
      // Redis not being configured, and that case already runs: fail open, log why.
      this.logger.warn(`[proactive-engine] Redis unreachable acquiring ${key} — running without lock: ${err?.message}`);
      return true;
    }
  }
}
