import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IngestorAgent } from '../../agents/ingestor.agent';

// XOVIS 3D sensor zones — provide absolute occupancy counts
const XOVIS_ZONES = [
  { zoneId: 'T1_SECURITY_LANE_1', terminalId: 'T1', baseOccupancy: 25, capacityMax: 60 },
  { zoneId: 'T1_SECURITY_LANE_2', terminalId: 'T1', baseOccupancy: 20, capacityMax: 60 },
  { zoneId: 'T1_IMMIGRATION', terminalId: 'T1', baseOccupancy: 40, capacityMax: 80 },
  { zoneId: 'T1_BAGGAGE_A', terminalId: 'T1', baseOccupancy: 30, capacityMax: 100 },
  { zoneId: 'T2_SECURITY_LANE_1', terminalId: 'T2', baseOccupancy: 15, capacityMax: 60 },
  { zoneId: 'T2_IMMIGRATION', terminalId: 'T2', baseOccupancy: 35, capacityMax: 80 },
];

@Injectable()
export class MockXovisAdapter {
  private readonly logger = new Logger(MockXovisAdapter.name);
  private occupancyState: Map<string, number> = new Map();

  constructor(private readonly ingestorAgent: IngestorAgent) {
    // Initialise occupancy state
    XOVIS_ZONES.forEach((z) => {
      this.occupancyState.set(z.zoneId, z.baseOccupancy);
    });
  }

  @Cron('*/5 * * * * *') // every 5 seconds
  async emitXovisReadings() {
    for (const zone of XOVIS_ZONES) {
      // Simulate realistic occupancy drift
      const currentOccupancy = this.occupancyState.get(zone.zoneId) ?? zone.baseOccupancy;
      const drift = Math.floor((Math.random() - 0.45) * 8); // slight upward bias during peak
      const newOccupancy = Math.max(
        0,
        Math.min(zone.capacityMax, currentOccupancy + drift),
      );
      this.occupancyState.set(zone.zoneId, newOccupancy);

      await this.ingestorAgent.processRawEvent({
        source: 'XOVIS',
        zoneId: zone.zoneId,
        terminalId: zone.terminalId,
        occupancyAbsolute: newOccupancy,
        passengerCountDelta: drift,
        metadata: { sensorType: 'XOVIS_S3D', confidence: 0.95 },
      });
    }
  }
}
