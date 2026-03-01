import { Module } from '@nestjs/common';
import { LlmQueryController } from './llm-query.controller';
import { LlmQueryService } from './llm-query.service';

@Module({
  controllers: [LlmQueryController],
  providers: [LlmQueryService],
})
export class LlmQueryModule {}
