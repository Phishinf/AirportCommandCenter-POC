import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { PRISMA_TOKEN, REDIS_TOKEN } from '../database/database.module';

@Injectable()
export class AlertsService {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaClient,
    @Inject(REDIS_TOKEN) private readonly redis: Redis,
  ) {}

  async getActiveAlerts() {
    const raw = await this.redis.lrange('nexus:alerts:active', 0, 99);
    const alerts = raw.map((item) => JSON.parse(item));
    return { alerts, count: alerts.length };
  }

  async resolveAlert(anomalyId: string, resolvedBy: string, notes?: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { anomalyId },
    });

    if (!alert) {
      throw new NotFoundException(`Alert with anomalyId '${anomalyId}' not found`);
    }

    const resolvedAt = new Date();

    await this.prisma.alert.update({
      where: { anomalyId },
      data: {
        isActive: false,
        resolvedAt,
        resolvedBy,
      },
    });

    // Remove from Redis active list
    const activeAlerts = await this.redis.lrange('nexus:alerts:active', 0, -1);
    const updated = activeAlerts.filter((item) => {
      try {
        return JSON.parse(item).anomalyId !== anomalyId;
      } catch {
        return true;
      }
    });

    await this.redis.del('nexus:alerts:active');
    if (updated.length > 0) {
      await this.redis.rpush('nexus:alerts:active', ...updated);
    }

    return { anomalyId, resolvedAt: resolvedAt.toISOString() };
  }

  async persistAlert(alert: {
    anomalyId: string;
    zoneId: string;
    terminalId: string;
    anomalyType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    detectedAt: string;
    description: string;
  }) {
    await this.prisma.alert.upsert({
      where: { anomalyId: alert.anomalyId },
      create: {
        ...alert,
        detectedAt: new Date(alert.detectedAt),
      },
      update: {},
    });
  }
}
