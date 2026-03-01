import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Kafka } from 'kafkajs';
import { SentinelAgent, SENTINEL_REDIS_TOKEN, SENTINEL_KAFKA_TOKEN } from './sentinel.agent';

@Module({
  providers: [
    {
      provide: SENTINEL_REDIS_TOKEN,
      useFactory: () => {
        return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
      },
    },
    {
      provide: SENTINEL_KAFKA_TOKEN,
      useFactory: async () => {
        const kafka = new Kafka({
          clientId: 'nexus-sentinel',
          brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
        });
        const producer = kafka.producer();
        await producer.connect();
        return producer;
      },
    },
    SentinelAgent,
  ],
  exports: [SentinelAgent],
})
export class SentinelAgentModule {}
