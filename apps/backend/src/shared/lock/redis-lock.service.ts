import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';

/**
 * RedisLockService — distributed mutual-exclusion lock shared across backend
 * replicas.
 *
 * Why: several @Interval/@Cron workers (followup, email campaigns, monitor
 * consolidation, conversation janitor, ticket intelligence, sender) mutate data
 * and send messages. Running more than one backend instance without a lock makes
 * each instance fire the same tick, causing duplicate follow-ups, double e-mail
 * campaigns and repeated ticket analysis. This service lets a worker guard its
 * tick so only one instance executes it at a time.
 *
 * Design:
 *  - Single shared ioredis connection (REGRA 5 — do not proliferate connections;
 *    the existing per-worker Redis clients are intentionally left untouched to
 *    respect scope, but new workers should use this service).
 *  - SET key token NX EX ttl → atomic acquire.
 *  - Release via a Lua compare-and-delete: only deletes the key if we still own
 *    the token, so an instance whose lock already expired cannot delete a lock a
 *    different instance has since acquired.
 *  - No Redis configured → acts as a no-op (always "acquires"), so single-instance
 *    dev/deploys keep working exactly as before.
 */

// KEYS[1] = lock key, ARGV[1] = our token. Deletes only if the token matches.
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end`;

/** Releases the lock. Safe to call once; a no-op if the lock already expired. */
export type LockRelease = () => Promise<void>;

@Injectable()
export class RedisLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('RedisLock');
  private redis: Redis | null = null;

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, { lazyConnect: true });
    } else {
      this.logger.warn('REDIS_URL not set — distributed locks disabled (single-instance mode)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => null);
  }

  /**
   * Tries to acquire the lock `key` for `ttlSeconds`. Returns a release function
   * when acquired, or `null` when another instance already holds it. Without Redis
   * it always returns a no-op release (single-instance mode).
   *
   * The TTL is a crash safety-net: the caller should release in a `finally`, but
   * if the process dies mid-run the lock frees itself after `ttlSeconds`. Pick a
   * TTL comfortably above the tick's normal runtime and below its interval.
   */
  async acquire(key: string, ttlSeconds: number): Promise<LockRelease | null> {
    if (!this.redis) return async () => {}; // single-instance mode → always run

    const token = randomUUID();
    let acquired: string | null;
    try {
      acquired = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX');
    } catch (err) {
      // Redis unreachable → fail-open (run anyway) so a Redis blip never silences
      // a worker. Log the reason (REGRA 3 — never swallow errors).
      this.logger.warn(`acquire failed for ${key}, running without lock: ${(err as Error).message}`);
      return async () => {};
    }

    if (acquired !== 'OK') return null; // held by another instance

    return async () => {
      try {
        await this.redis!.eval(RELEASE_SCRIPT, 1, key, token);
      } catch (err) {
        this.logger.warn(`release failed for ${key} (will expire in ${ttlSeconds}s): ${(err as Error).message}`);
      }
    };
  }
}
