import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

export const TIMESCALE_TOKEN = 'TIMESCALE_POOL';
export const REDIS_TOKEN = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: TIMESCALE_TOKEN,
      useFactory: () => {
        const pool = new Pool({ connectionString: process.env.TIMESCALE_URL });
        console.log('[Ingestor] TimescaleDB pool created');
        return pool;
      },
    },
    {
      provide: REDIS_TOKEN,
      useFactory: () => {
        const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
        client.on('connect', () => console.log('[Ingestor] Redis connected'));
        client.on('error', (err) =>
          console.error('[Ingestor] Redis error:', err.message),
        );
        return client;
      },
    },
  ],
  exports: [TIMESCALE_TOKEN, REDIS_TOKEN],
})
export class InfrastructureModule {}
