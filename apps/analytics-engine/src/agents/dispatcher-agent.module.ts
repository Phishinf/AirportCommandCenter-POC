import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { DispatcherAgent, DISPATCHER_REDIS_TOKEN } from './dispatcher.agent';

@Module({
  providers: [
    {
      provide: DISPATCHER_REDIS_TOKEN,
      useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    },
    DispatcherAgent,
  ],
  exports: [DispatcherAgent],
})
export class DispatcherAgentModule {}
