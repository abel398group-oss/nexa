import { Global, Module } from '@nestjs/common';
import { RedisLockService } from './redis-lock.service';

/**
 * Global so any feature module can inject RedisLockService without importing this
 * module explicitly. Provides a single shared Redis connection for locking.
 */
@Global()
@Module({
  providers: [RedisLockService],
  exports: [RedisLockService],
})
export class RedisLockModule {}
