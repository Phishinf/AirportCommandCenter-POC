import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KafkaModule } from './kafka/kafka.module';
import { IngestorAgentModule } from './agents/ingestor-agent.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    InfrastructureModule,
    KafkaModule,
    IngestorAgentModule,
    ConnectorsModule,
  ],
})
export class AppModule {}
