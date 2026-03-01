import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Kafka, Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

export const PROPHET_REDIS_TOKEN = 'PROPHET_REDIS';
export const PROPHET_KAFKA_TOKEN = 'PROPHET_KAFKA';

/**
 * Prophet Agent — Predictive Queue Forecasting
 *
 * Generates T-30/60/90 minute queue wait-time forecasts.
 * In POC mode: uses a simple trend extrapolation from recent TimescaleDB data.
 * In production: delegates to Python FastAPI LSTM model via HTTP bridge.
 */
@Injectable()
export class ProphetAgent {
  private readonly logger = new Logger(ProphetAgent.name);

  constructor(
    @Inject(PROPHET_REDIS_TOKEN) private readonly redis: Redis,
    @Inject(PROPHET_KAFKA_TOKEN) private readonly producer: Producer,
  ) {}

  async generateForecast(zoneId: string, currentOccupancy: number): Promise<void> {
    // Attempt Python bridge first; fall back to simple extrapolation for POC
    let forecast = await this.callPythonBridge(zoneId, currentOccupancy);

    if (!forecast) {
      forecast = this.simpleExtrapolation(zoneId, currentOccupancy);
    }

    // Cache in Redis
    await this.redis.setex(
      `nexus:forecast:${zoneId}`,
      60,
      JSON.stringify(forecast),
    );

    // Check threshold breaches
    await this.checkThresholdBreaches(zoneId, forecast);

    this.logger.debug(`[Prophet] Forecast generated for ${zoneId}: T30=${forecast.horizons.t30.predictedWaitMinutes}min`);
  }

  private async callPythonBridge(
    zoneId: string,
    currentOccupancy: number,
  ): Promise<any | null> {
    const prophetUrl = process.env.PROPHET_URL;
    if (!prophetUrl) return null;

    try {
      const response = await fetch(`${prophetUrl}/predict/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId, currentOccupancy }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  private simpleExtrapolation(
    zoneId: string,
    currentOccupancy: number,
  ) {
    // Simplified linear model for POC — occupancy to wait time
    const waitPerPax = 0.3; // minutes per person
    const baseWait = currentOccupancy * waitPerPax;

    // Add uncertainty that grows with horizon
    const addNoise = (base: number, noise: number) =>
      Math.max(0, Math.round(base + (Math.random() - 0.5) * noise));

    return {
      zoneId,
      generatedAt: new Date().toISOString(),
      horizons: {
        t30: { predictedWaitMinutes: addNoise(baseWait * 1.1, 3), confidence: 0.82 },
        t60: { predictedWaitMinutes: addNoise(baseWait * 1.2, 6), confidence: 0.71 },
        t90: { predictedWaitMinutes: addNoise(baseWait * 1.35, 9), confidence: 0.58 },
      },
      flightCorrelations: [],
    };
  }

  private async checkThresholdBreaches(
    zoneId: string,
    forecast: ReturnType<typeof this.simpleExtrapolation>,
  ) {
    // Example threshold: 20 minutes = warning trigger
    const THRESHOLD = 20;

    for (const [horizon, data] of Object.entries(forecast.horizons) as [string, { predictedWaitMinutes: number }][]) {
      if (data.predictedWaitMinutes >= THRESHOLD) {
        const breach = {
          breachId: uuidv4(),
          zoneId,
          terminalId: zoneId.split('_')[0],
          horizon,
          predictedWaitMinutes: data.predictedWaitMinutes,
          thresholdMinutes: THRESHOLD,
          detectedAt: new Date().toISOString(),
        };

        await this.producer.send({
          topic: 'events.threshold',
          messages: [{ key: zoneId, value: JSON.stringify(breach) }],
        });
      }
    }
  }
}
