#!/usr/bin/env ts-node
/**
 * Nexus Aviation Suite — Historical Flow Event Generator
 * Seeds TimescaleDB with synthetic historical passenger flow data.
 *
 * Usage: npx ts-node tools/simulators/generate-flow-events.ts [--days=7] [--dry-run]
 */

import { Pool } from 'pg';

const TIMESCALE_URL =
  process.env.TIMESCALE_URL ??
  'postgresql://nexus_ts:timescale_secret@localhost:5433/nexus_timeseries';

const ZONES = [
  { id: 'T1_SECURITY_LANE_1', terminalId: 'T1', peakOccupancy: 55, offPeakOccupancy: 15 },
  { id: 'T1_SECURITY_LANE_2', terminalId: 'T1', peakOccupancy: 50, offPeakOccupancy: 10 },
  { id: 'T1_SECURITY_LANE_3', terminalId: 'T1', peakOccupancy: 45, offPeakOccupancy: 8 },
  { id: 'T1_IMMIGRATION', terminalId: 'T1', peakOccupancy: 70, offPeakOccupancy: 20 },
  { id: 'T1_CHECKIN_A', terminalId: 'T1', peakOccupancy: 150, offPeakOccupancy: 30 },
  { id: 'T1_CHECKIN_B', terminalId: 'T1', peakOccupancy: 140, offPeakOccupancy: 25 },
  { id: 'T1_RETAIL_PLAZA', terminalId: 'T1', peakOccupancy: 200, offPeakOccupancy: 50 },
  { id: 'T1_GATE_A12', terminalId: 'T1', peakOccupancy: 90, offPeakOccupancy: 10 },
  { id: 'T1_GATE_B08', terminalId: 'T1', peakOccupancy: 100, offPeakOccupancy: 5 },
  { id: 'T2_SECURITY_LANE_1', terminalId: 'T2', peakOccupancy: 50, offPeakOccupancy: 12 },
  { id: 'T2_IMMIGRATION', terminalId: 'T2', peakOccupancy: 65, offPeakOccupancy: 18 },
  { id: 'T2_CHECKIN_B', terminalId: 'T2', peakOccupancy: 130, offPeakOccupancy: 22 },
];

const SOURCES = ['XOVIS', 'WIFI', 'AODB'] as const;

function isPeakHour(hour: number): boolean {
  return (hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 20);
}

function gaussian(mean: number, std: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(mean + z * std));
}

async function generateHistoricalData(days: number, dryRun: boolean) {
  const pool = new Pool({ connectionString: TIMESCALE_URL });

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  console.log(`Generating ${days} days of historical flow data...`);
  console.log(`From: ${startDate.toISOString()}`);
  console.log(`To:   ${now.toISOString()}`);
  console.log(`Zones: ${ZONES.length}, Dry run: ${dryRun}`);

  let totalEvents = 0;
  const batchSize = 500;
  const batch: string[] = [];

  const flushBatch = async () => {
    if (dryRun || batch.length === 0) {
      batch.length = 0;
      return;
    }

    const values = batch.join(', ');
    await pool.query(
      `INSERT INTO flow_metrics
        (time, zone_id, terminal_id, source_system, occupancy_absolute,
         passenger_count_delta, metadata)
       VALUES ${values}
       ON CONFLICT DO NOTHING`,
    );
    batch.length = 0;
  };

  let paramIdx = 1;
  const paramValues: unknown[] = [];

  // Iterate through each hour of each day
  let cursor = new Date(startDate);
  while (cursor <= now) {
    const hour = cursor.getUTCHours();
    const peak = isPeakHour(hour);

    for (const zone of ZONES) {
      const targetOccupancy = peak ? zone.peakOccupancy : zone.offPeakOccupancy;
      const occupancy = gaussian(targetOccupancy, targetOccupancy * 0.15);
      const delta = Math.floor((Math.random() - 0.5) * 10);
      const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];

      // Add jitter within the hour (±30 minutes)
      const jitter = Math.floor((Math.random() - 0.5) * 60 * 60 * 1000);
      const eventTime = new Date(cursor.getTime() + jitter);

      if (dryRun) {
        // Just count
      } else {
        batch.push(
          `('${eventTime.toISOString()}', '${zone.id}', '${zone.terminalId}', '${source}', ${occupancy}, ${delta}, '{"simulated": true}'::jsonb)`,
        );

        if (batch.length >= batchSize) {
          await flushBatch();
        }
      }

      totalEvents++;
    }

    // Advance by 1 hour
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
  }

  await flushBatch();

  if (dryRun) {
    console.log(`[DRY RUN] Would have inserted ${totalEvents} events`);
  } else {
    console.log(`✓ Inserted ${totalEvents} flow events into TimescaleDB`);
  }

  await pool.end();
}

// Parse CLI args
const args = process.argv.slice(2);
const days = parseInt(
  args.find((a) => a.startsWith('--days='))?.split('=')[1] ?? '7',
);
const dryRun = args.includes('--dry-run');

generateHistoricalData(days, dryRun).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
