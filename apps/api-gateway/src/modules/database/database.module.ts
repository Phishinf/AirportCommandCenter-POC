import { Global, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import neo4j, { Driver } from 'neo4j-driver';

export const PRISMA_TOKEN = 'PRISMA_CLIENT';
export const TIMESCALE_TOKEN = 'TIMESCALE_POOL';
export const REDIS_TOKEN = 'REDIS_CLIENT';
export const NEO4J_TOKEN = 'NEO4J_DRIVER';

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_TOKEN,
      useFactory: async () => {
        const client = new PrismaClient({
          datasources: { db: { url: process.env.DATABASE_URL } },
        });
        await client.$connect();
        console.log('[Database] Prisma connected to PostgreSQL');
        return client;
      },
    },
    {
      provide: TIMESCALE_TOKEN,
      useFactory: () => {
        const pool = new Pool({ connectionString: process.env.TIMESCALE_URL });
        console.log('[Database] TimescaleDB pool created');
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
        client.on('connect', () => console.log('[Database] Redis connected'));
        client.on('error', (err) =>
          console.error('[Database] Redis error:', err.message),
        );
        return client;
      },
    },
    {
      provide: NEO4J_TOKEN,
      useFactory: () => {
        const driver = neo4j.driver(
          process.env.NEO4J_URI ?? 'bolt://localhost:7687',
          neo4j.auth.basic(
            process.env.NEO4J_USER ?? 'neo4j',
            process.env.NEO4J_PASSWORD ?? 'nexus_graph',
          ),
        );
        console.log('[Database] Neo4j driver created');
        return driver;
      },
    },
  ],
  exports: [PRISMA_TOKEN, TIMESCALE_TOKEN, REDIS_TOKEN, NEO4J_TOKEN],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  constructor() {}

  async onModuleInit() {}

  async onModuleDestroy() {}
}
