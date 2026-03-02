import { Module } from '@nestjs/common';
import { SentinelAgentModule } from '../agents/sentinel-agent.module';
import { ProphetAgentModule } from '../agents/prophet-agent.module';
import { DispatcherAgentModule } from '../agents/dispatcher-agent.module';
import { KafkaConsumerService } from './kafka-consumer.service';

@Module({
  imports: [SentinelAgentModule, ProphetAgentModule, DispatcherAgentModule],
  providers: [KafkaConsumerService],
})
export class KafkaConsumerModule {}
