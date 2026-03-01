import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IngestorAgent } from '../../agents/ingestor.agent';

// Sample airport Wi-Fi AP → Zone mappings for POC
const WIFI_ZONES = [
  { apLocationId: 'AP-T1-SEC-01', zoneId: 'T1_SECURITY_LANE_1', terminalId: 'T1' },
  { apLocationId: 'AP-T1-SEC-02', zoneId: 'T1_SECURITY_LANE_2', terminalId: 'T1' },
  { apLocationId: 'AP-T1-CHK-01', zoneId: 'T1_CHECKIN_A', terminalId: 'T1' },
  { apLocationId: 'AP-T1-IMG-01', zoneId: 'T1_IMMIGRATION', terminalId: 'T1' },
  { apLocationId: 'AP-T2-SEC-01', zoneId: 'T2_SECURITY_LANE_1', terminalId: 'T2' },
  { apLocationId: 'AP-T2-CHK-01', zoneId: 'T2_CHECKIN_B', terminalId: 'T2' },
];

@Injectable()
export class MockWifiAdapter {
  private readonly logger = new Logger(MockWifiAdapter.name);

  constructor(private readonly ingestorAgent: IngestorAgent) {}

  @Cron('*/3 * * * * *') // every 3 seconds
  async emitWifiEvents() {
    const numEvents = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < numEvents; i++) {
      const zone = WIFI_ZONES[Math.floor(Math.random() * WIFI_ZONES.length)];
      const macAddress = this.generateMacAddress();

      await this.ingestorAgent.processRawEvent({
        source: 'WIFI',
        zoneId: zone.zoneId,
        terminalId: zone.terminalId,
        apLocationId: zone.apLocationId,
        macAddress,
        eventType: Math.random() > 0.2 ? 'ASSOCIATION' : 'DISASSOCIATION',
        rssi: -(Math.floor(Math.random() * 40) + 50), // -50 to -90 dBm
        passengerCountDelta: Math.random() > 0.2 ? 1 : -1,
      });
    }
  }

  private generateMacAddress(): string {
    return Array.from({ length: 6 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0'),
    ).join(':');
  }
}
