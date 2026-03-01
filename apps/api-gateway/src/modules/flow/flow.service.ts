import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { TIMESCALE_TOKEN, REDIS_TOKEN, PRISMA_TOKEN } from '../database/database.module';
import { LiveZoneSnapshot } from '../../../../../../libs/common/src/interfaces/flow-event.interface';

@Injectable()
export class FlowService {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaClient,
    @Inject(TIMESCALE_TOKEN) private readonly timescale: Pool,
    @Inject(REDIS_TOKEN) private readonly redis: Redis,
  ) {}

  async getLiveSnapshot(terminalId?: string, zoneType?: string): Promise<{
    snapshot: LiveZoneSnapshot[];
    generatedAt: string;
  }> {
    const zones = await this.prisma.zone.findMany({
      where: {
        ...(terminalId ? { terminalId } : {}),
        ...(zoneType ? { type: zoneType as any } : {}),
      },
    });

    const snapshot: LiveZoneSnapshot[] = await Promise.all(
      zones.map(async (zone) => {
        const cached = await this.redis.get(`nexus:occupancy:${zone.id}`);
        const data = cached ? JSON.parse(cached) : { occupancy: 0, updatedAt: new Date().toISOString() };

        const occupancyAbsolute = data.occupancy ?? 0;
        const occupancyPct = Math.min(
          Math.round((occupancyAbsolute / zone.capacityMax) * 100),
          100,
        );

        let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
        if (occupancyPct >= 90) status = 'CRITICAL';
        else if (occupancyPct >= zone.alertThresholdPct) status = 'WARNING';

        return {
          zoneId: zone.id,
          terminalId: zone.terminalId,
          zoneType: zone.type,
          occupancyAbsolute,
          capacityMax: zone.capacityMax,
          occupancyPct,
          status,
          updatedAt: data.updatedAt,
        };
      }),
    );

    return { snapshot, generatedAt: new Date().toISOString() };
  }

  async getHistory(
    zoneId: string,
    from: string,
    to: string,
    bucket: '1min' | '5min' | '15min' | '1hour',
  ) {
    const intervalMap: Record<string, string> = {
      '1min': '1 minute',
      '5min': '5 minutes',
      '15min': '15 minutes',
      '1hour': '1 hour',
    };
    const interval = intervalMap[bucket] ?? '15 minutes';

    const result = await this.timescale.query(
      `
      SELECT
        time_bucket($1::interval, time) AS bucket,
        AVG(occupancy_absolute)         AS "avgOccupancy",
        MAX(occupancy_absolute)         AS "maxOccupancy",
        SUM(passenger_count_delta)      AS "totalFlow"
      FROM flow_metrics
      WHERE zone_id = $2
        AND time >= $3::timestamptz
        AND time <= $4::timestamptz
        AND occupancy_absolute IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
      [interval, zoneId, from, to],
    );

    return {
      zoneId,
      buckets: result.rows.map((row) => ({
        time: row.bucket,
        avgOccupancy: parseFloat(row.avgOccupancy) || 0,
        maxOccupancy: parseFloat(row.maxOccupancy) || 0,
        totalFlow: parseInt(row.totalFlow) || 0,
      })),
    };
  }

  async getHeatmap(terminalId?: string) {
    const zones = await this.prisma.zone.findMany({
      where: terminalId ? { terminalId } : {},
    });

    const heatZones = await Promise.all(
      zones.map(async (zone) => {
        const cached = await this.redis.get(`nexus:occupancy:${zone.id}`);
        const data = cached ? JSON.parse(cached) : { occupancy: 0 };
        const occupancyPct = Math.min(
          Math.round(((data.occupancy ?? 0) / zone.capacityMax) * 100),
          100,
        );

        return {
          zoneId: zone.id,
          x: (data.x as number) ?? 0,
          y: (data.y as number) ?? 0,
          occupancyPct,
          zoneType: zone.type,
        };
      }),
    );

    return { zones: heatZones };
  }

  async getForecasts(zoneId?: string, terminalId?: string) {
    let zoneIds: string[];

    if (zoneId) {
      zoneIds = [zoneId];
    } else {
      const zones = await this.prisma.zone.findMany({
        where: terminalId ? { terminalId } : {},
        select: { id: true },
      });
      zoneIds = zones.map((z) => z.id);
    }

    const forecasts = await Promise.all(
      zoneIds.map(async (id) => {
        const cached = await this.redis.get(`nexus:forecast:${id}`);
        return cached ? JSON.parse(cached) : null;
      }),
    );

    return { forecasts: forecasts.filter(Boolean) };
  }
}
