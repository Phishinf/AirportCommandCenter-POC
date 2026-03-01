import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Kafka } from 'kafkajs';
import { ProphetAgent, PROPHET_REDIS_TOKEN, PROPHET_KAFKA_TOKEN } from './prophet.agent';

@Module({
  providers: [
    {
      provide: PROPHET_REDIS_TOKEN,
      useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    },
    {
      provide: PROPHET_KAFKA_TOKEN,
      useFactory: async () => {
        const kafka = new Kafka({
          clientId: 'nexus-prophet',
          brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
        });
        const producer = kafka.producer();
        await producer.connect();
        return producer;
      },
    },
    ProphetAgent,
  ],
  exports: [ProphetAgent],
})
export class ProphetAgentModule {}
