import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { FlowModule } from './modules/flow/flow.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { GraphModule } from './modules/graph/graph.module';
import { LlmQueryModule } from './modules/llm-query/llm-query.module';
import { EventsModule } from './modules/events/events.module';
import { DatabaseModule } from './modules/database/database.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60000, limit: 300 },
      { name: 'auth', ttl: 60000, limit: 10 },
      { name: 'llm', ttl: 60000, limit: 20 },
    ]),
    DatabaseModule,
    AuthModule,
    FlowModule,
    AlertsModule,
    RecommendationsModule,
    GraphModule,
    LlmQueryModule,
    EventsModule,
  ],
})
export class AppModule {}
