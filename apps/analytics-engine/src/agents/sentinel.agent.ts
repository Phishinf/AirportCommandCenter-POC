import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Kafka, Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

export const SENTINEL_REDIS_TOKEN = 'SENTINEL_REDIS';
export const SENTINEL_KAFKA_TOKEN = 'SENTINEL_KAFKA';

/**
 * Sentinel Agent — Anomaly Detection
 *
 * Detects flow anomalies using Z-score comparison against rolling 7-day baseline.
 * Publishes AnomalyEvent to `events.anomaly` Kafka topic when threshold breached.
 */
@Injectable()
export class SentinelAgent {
  private readonly logger = new Logger(SentinelAgent.name);
  private readonly zScoreThreshold = 2.5;

  constructor(
    @Inject(SENTINEL_REDIS_TOKEN) private readonly redis: Redis,
    @Inject(SENTINEL_KAFKA_TOKEN) private readonly producer: Producer,
  ) {}

  async analyseFlowEvent(event: {
    zoneId: string;
    terminalId: string;
    occupancyAbsolute: number;
    timestamp: string;
  }): Promise<void> {
    // Fetch baseline stats for this zone
    const baselineKey = `nexus:baseline:${event.zoneId}`;
    const baselineRaw = await this.redis.get(baselineKey);

    if (!baselineRaw) {
      // No baseline yet — can't detect anomalies
      return;
    }

    const baseline: { mean: number; std: number } = JSON.parse(baselineRaw);

    if (baseline.std === 0) return;

    const zScore = Math.abs(
      (event.occupancyAbsolute - baseline.mean) / baseline.std,
    );

    if (zScore >= this.zScoreThreshold) {
      await this.emitAnomalyEvent({
        zoneId: event.zoneId,
        terminalId: event.terminalId,
        occupancy: event.occupancyAbsolute,
        baseline,
        zScore,
        timestamp: event.timestamp,
      });
    }
  }

  private async emitAnomalyEvent(params: {
    zoneId: string;
    terminalId: string;
    occupancy: number;
    baseline: { mean: number; std: number };
    zScore: number;
    timestamp: string;
  }) {
    const severity =
      params.zScore >= 4 ? 'CRITICAL' :
      params.zScore >= 3 ? 'HIGH' :
      params.zScore >= 2.5 ? 'MEDIUM' : 'LOW';

    const anomaly = {
      anomalyId: uuidv4(),
      zoneId: params.zoneId,
      terminalId: params.terminalId,
      anomalyType: 'FLOW_DEVIANCE',
      severity,
      detectedAt: params.timestamp,
      description: `Flow deviance at ${params.zoneId}: occupancy ${params.occupancy} vs baseline mean ${params.baseline.mean.toFixed(1)} (z-score: ${params.zScore.toFixed(2)})`,
      zScore: params.zScore,
      observedValue: params.occupancy,
      baselineValue: params.baseline.mean,
      recommendedAction:
        severity === 'CRITICAL' || severity === 'HIGH'
          ? 'Open additional service lanes or redirect passenger flow immediately.'
          : 'Monitor zone closely. Consider pre-emptive resource reallocation.',
    };

    // Publish to Kafka
    await this.producer.send({
      topic: 'events.anomaly',
      messages: [{ key: params.zoneId, value: JSON.stringify(anomaly) }],
    });

    // Push to Redis active alerts list (cap at 100)
    await this.redis.lpush('nexus:alerts:active', JSON.stringify(anomaly));
    await this.redis.ltrim('nexus:alerts:active', 0, 99);

    this.logger.warn(
      `[Sentinel] Anomaly detected: ${params.zoneId} z=${params.zScore.toFixed(2)} severity=${severity}`,
    );
  }
}
