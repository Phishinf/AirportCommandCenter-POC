import { Global, Module } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

export const KAFKA_PRODUCER_TOKEN = 'KAFKA_PRODUCER';

@Global()
@Module({
  providers: [
    {
      provide: KAFKA_PRODUCER_TOKEN,
      useFactory: async () => {
        const kafka = new Kafka({
          clientId: 'nexus-ingestor',
          brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
          retry: { retries: 5 },
        });

        const producer = kafka.producer();
        await producer.connect();
        console.log('[Kafka] Producer connected');
        return producer;
      },
    },
  ],
  exports: [KAFKA_PRODUCER_TOKEN],
})
export class KafkaModule {}
