import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { FlowEvent, AnomalyEvent } from '@nexus/common';
import { SentinelAgent } from '../agents/sentinel.agent';
import { ProphetAgent } from '../agents/prophet.agent';
import { DispatcherAgent } from '../agents/dispatcher.agent';

/**
 * Kafka Consumer Service — Analytics Engine
 *
 * Bridges the Kafka event bus to the three analytics agents:
 *   events.flow      → Sentinel (anomaly detection) + Prophet (forecasting) in parallel
 *   events.anomaly   → Dispatcher (scenario simulation)
 *   events.threshold → Dispatcher (scenario simulation, threshold breach adapted to AnomalyEvent)
 */
@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer!: Consumer;

  constructor(
    private readonly sentinelAgent: SentinelAgent,
    private readonly prophetAgent: ProphetAgent,
    private readonly dispatcherAgent: DispatcherAgent,
  ) {}

  async onModuleInit(): Promise<void> {
    const kafka = new Kafka({
      clientId: 'nexus-analytics-consumer',
      brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
      retry: { retries: 5 },
    });

    this.consumer = kafka.consumer({
      groupId: process.env.KAFKA_GROUP_ID_ANALYTICS ?? 'nexus-analytics-group',
    });

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['events.flow', 'events.anomaly', 'events.threshold'],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async ({ topic, message }: EachMessagePayload) => {
          if (!message.value) return;
          try {
            const payload = JSON.parse(message.value.toString());
            await this.route(topic, payload);
          } catch (err) {
            this.logger.error(
              `Failed to process message from ${topic}: ${(err as Error).message}`,
            );
          }
        },
      });

      this.logger.log(
        'Analytics consumers started [events.flow, events.anomaly, events.threshold]',
      );
    } catch (err) {
      this.logger.warn(
        `Analytics consumer startup failed (Kafka may not be ready): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }

  private async route(topic: string, payload: unknown): Promise<void> {
    if (topic === 'events.flow') {
      await this.handleFlowEvent(payload as FlowEvent);
    } else if (topic === 'events.anomaly') {
      await this.dispatcherAgent.generateScenarios(payload as AnomalyEvent);
    } else if (topic === 'events.threshold') {
      await this.dispatcherAgent.generateScenarios(
        this.bridgeThresholdToAnomaly(payload as ThresholdBreachMessage),
      );
    }
  }

  private async handleFlowEvent(event: FlowEvent): Promise<void> {
    // Sentinel and Prophet are independent — run in parallel
    await Promise.all([
      this.sentinelAgent.analyseFlowEvent({
        zoneId: event.zoneId,
        terminalId: event.terminalId,
        occupancyAbsolute: event.occupancyAbsolute ?? 0,
        timestamp: event.timestamp,
      }),
      this.prophetAgent.generateForecast(
        event.zoneId,
        event.occupancyAbsolute ?? 0,
      ),
    ]);
  }

  /**
   * Adapts a ThresholdBreachEvent to the AnomalyEvent shape expected by the
   * Dispatcher so it can generate resource reallocation scenarios.
   */
  private bridgeThresholdToAnomaly(breach: ThresholdBreachMessage): AnomalyEvent {
    const ratio = breach.predictedWaitMinutes / breach.thresholdMinutes;
    const severity = ratio >= 2 ? 'HIGH' : 'MEDIUM';

    return {
      anomalyId: breach.breachId,
      zoneId: breach.zoneId,
      terminalId: breach.terminalId,
      anomalyType: 'THRESHOLD_BREACH',
      severity,
      detectedAt: breach.detectedAt,
      description:
        `Queue threshold breach at ${breach.zoneId}: ` +
        `${breach.predictedWaitMinutes}min predicted at ${breach.horizon} horizon ` +
        `(threshold: ${breach.thresholdMinutes}min)`,
      observedValue: breach.predictedWaitMinutes,
      baselineValue: breach.thresholdMinutes,
    };
  }
}

interface ThresholdBreachMessage {
  breachId: string;
  zoneId: string;
  terminalId: string;
  horizon: string;
  predictedWaitMinutes: number;
  thresholdMinutes: number;
  detectedAt: string;
}
