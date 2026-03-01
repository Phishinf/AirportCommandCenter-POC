import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected');
    });
  }
  return redisClient;
}

// ─── Typed key helpers ────────────────────────────────────────────────────────

export const RedisKeys = {
  occupancy: (zoneId: string) => `nexus:occupancy:${zoneId}`,
  forecast: (zoneId: string) => `nexus:forecast:${zoneId}`,
  baseline: (zoneId: string) => `nexus:baseline:${zoneId}`,
  alertsActive: () => `nexus:alerts:active`,
  recommendationsLatest: () => `nexus:recommendations:latest`,
  flightSchedule: () => `nexus:flight-schedule:next3h`,
  session: (userId: string) => `nexus:session:${userId}`,
} as const;

// ─── TTL constants (seconds) ──────────────────────────────────────────────────

export const RedisTTL = {
  occupancy: 30,
  forecast: 60,
  baseline: 7 * 24 * 60 * 60,   // 7 days
  recommendations: 5 * 60,       // 5 minutes
  flightSchedule: 5 * 60,        // 5 minutes
  session: 24 * 60 * 60,         // 24 hours
} as const;
