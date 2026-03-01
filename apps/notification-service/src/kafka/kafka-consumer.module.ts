import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';

/**
 * Notification Kafka Consumer
 * Listens to events.anomaly and events.threshold, then dispatches
 * in-app WebSocket notifications (and optionally email/SMS).
 */
@Module({})
export class KafkaConsumerModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerModule.name);
  private consumer: Consumer;

  async onModuleInit() {
    const kafka = new Kafka({
      clientId: 'nexus-notification',
      brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
      retry: { retries: 5 },
    });

    this.consumer = kafka.consumer({
      groupId: process.env.KAFKA_GROUP_ID_NOTIFICATION ?? 'nexus-notification-group',
    });

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['events.anomaly', 'events.threshold'],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          if (!message.value) return;
          const payload = JSON.parse(message.value.toString());

          if (topic === 'events.anomaly') {
            await this.handleAnomalyAlert(payload);
          } else if (topic === 'events.threshold') {
            await this.handleThresholdBreach(payload);
          }
        },
      });

      this.logger.log('Notification consumers started');
    } catch (err) {
      this.logger.warn(
        `Notification consumer startup failed (Kafka may not be ready): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.consumer?.disconnect();
  }

  private async handleAnomalyAlert(alert: {
    anomalyId: string;
    zoneId: string;
    severity: string;
    description: string;
  }) {
    this.logger.warn(
      `[ALERT] [${alert.severity}] ${alert.zoneId}: ${alert.description}`,
    );

    // Notify API Gateway WebSocket (in a production system, use Redis pub/sub
    // or a shared event bus — for POC, the API Gateway reads directly from Redis)
    await this.notifyApiGateway('alert:new', alert);
  }

  private async handleThresholdBreach(breach: {
    breachId: string;
    zoneId: string;
    horizon: string;
    predictedWaitMinutes: number;
  }) {
    this.logger.warn(
      `[THRESHOLD] ${breach.zoneId} @ ${breach.horizon}: ${breach.predictedWaitMinutes}min predicted`,
    );

    await this.notifyApiGateway('threshold:breach', breach);
  }

  private async notifyApiGateway(event: string, payload: unknown) {
    const gatewayUrl = process.env.API_GATEWAY_URL ?? 'http://localhost:4000';

    try {
      await fetch(`${gatewayUrl}/api/v1/internal/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, payload }),
      });
    } catch {
      // API Gateway may not be available during startup — silent failure is OK
    }
  }
}
