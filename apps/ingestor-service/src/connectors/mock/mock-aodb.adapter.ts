import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_TOKEN } from '../../infrastructure/infrastructure.module';

// Simulated AODB (Airport Operational Database) flight schedule
const MOCK_FLIGHTS = [
  { flightRef: 'SQ321', gate: 'T1_GATE_A12', departure: '+00:45', paxCount: 285 },
  { flightRef: 'EK007', gate: 'T1_GATE_B03', departure: '+01:20', paxCount: 412 },
  { flightRef: 'QF001', gate: 'T2_GATE_C07', departure: '+00:10', paxCount: 298 },
  { flightRef: 'BA016', gate: 'T2_GATE_D11', departure: '+02:05', paxCount: 325 },
  { flightRef: 'MH370', gate: 'T1_GATE_A05', departure: '+01:55', paxCount: 239 },
  { flightRef: 'SQ12', gate: 'T1_GATE_B08', departure: '+00:30', paxCount: 349 },
];

@Injectable()
export class MockAodbAdapter {
  private readonly logger = new Logger(MockAodbAdapter.name);

  constructor(@Inject(REDIS_TOKEN) private readonly redis: Redis) {}

  @Cron('0 */5 * * * *') // every 5 minutes
  async refreshFlightSchedule() {
    const now = new Date();
    const flights = MOCK_FLIGHTS.map((f) => ({
      ...f,
      scheduledDeparture: new Date(
        now.getTime() + this.parseDepartureOffset(f.departure),
      ).toISOString(),
    }));

    await this.redis.setex(
      'nexus:flight-schedule:next3h',
      5 * 60, // 5 minute TTL
      JSON.stringify(flights),
    );

    this.logger.log(`[AODB Mock] Updated flight schedule: ${flights.length} departures`);
  }

  private parseDepartureOffset(offset: string): number {
    // Parse "+HH:MM" format to milliseconds
    const match = offset.match(/\+(\d+):(\d+)/);
    if (!match) return 0;
    return (parseInt(match[1]) * 60 + parseInt(match[2])) * 60 * 1000;
  }
}
