import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SentinelAgentModule } from './agents/sentinel-agent.module';
import { ProphetAgentModule } from './agents/prophet-agent.module';
import { DispatcherAgentModule } from './agents/dispatcher-agent.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SentinelAgentModule,
    ProphetAgentModule,
    DispatcherAgentModule,
  ],
})
export class AppModule {}
