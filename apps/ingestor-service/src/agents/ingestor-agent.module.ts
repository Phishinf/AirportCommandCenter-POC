import { Module } from '@nestjs/common';
import { IngestorAgent } from './ingestor.agent';

@Module({
  providers: [IngestorAgent],
  exports: [IngestorAgent],
})
export class IngestorAgentModule {}
