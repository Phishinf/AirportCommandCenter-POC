import { Module } from '@nestjs/common';
import { IngestorAgentModule } from '../agents/ingestor-agent.module';
import { MockWifiAdapter } from './mock/mock-wifi.adapter';
import { MockXovisAdapter } from './mock/mock-xovis.adapter';
import { MockAodbAdapter } from './mock/mock-aodb.adapter';

const MOCK_CONNECTORS = [MockWifiAdapter, MockXovisAdapter, MockAodbAdapter];

@Module({
  imports: [IngestorAgentModule],
  providers: [
    // Only register mock connectors when CONNECTOR_MODE=mock (default for POC)
    ...(process.env.CONNECTOR_MODE !== 'live' ? MOCK_CONNECTORS : []),
  ],
})
export class ConnectorsModule {}
