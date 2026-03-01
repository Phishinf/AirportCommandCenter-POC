/**
 * Nexus Aviation Suite — Prisma Database Seed
 * Lives inside apps/api-gateway so it resolves @prisma/client from local node_modules.
 *
 * Run: npx prisma db seed   (from apps/api-gateway directory)
 */

import { PrismaClient, UserRole, ZoneType } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('Seeding database...');

  // ─── Terminals (must exist before users due to FK) ───────────────────────────
  await prisma.terminal.upsert({
    where: { id: 'T1' },
    update: {},
    create: { id: 'T1', name: 'Terminal 1', isActive: true },
  });
  await prisma.terminal.upsert({
    where: { id: 'T2' },
    update: {},
    create: { id: 'T2', name: 'Terminal 2', isActive: true },
  });
  console.log('✓ Seeded 2 terminals');

  // ─── Users ──────────────────────────────────────────────────────────────────
  const users = [
    { email: 'admin@nexus.airport', role: UserRole.ADMIN, terminalId: null },
    { email: 'ops@nexus.airport', role: UserRole.OPERATIONS, terminalId: null },
    { email: 'security@nexus.airport', role: UserRole.SECURITY, terminalId: 'T1' },
    { email: 'terminal@nexus.airport', role: UserRole.TERMINAL, terminalId: 'T1' },
    { email: 'airline@nexus.airport', role: UserRole.AIRLINE, terminalId: null },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: hashPassword('nexus2024!'),
        role: u.role,
        terminalId: u.terminalId,
        isActive: true,
      },
    });
  }
  console.log(`✓ Seeded ${users.length} users`);

  // ─── Zones ──────────────────────────────────────────────────────────────────
  const zones = [
    // Terminal 1
    { id: 'T1_SECURITY_LANE_1', terminalId: 'T1', name: 'Security Lane 1', type: ZoneType.SECURITY_LANE, capacityMax: 60, alertThresholdPct: 80 },
    { id: 'T1_SECURITY_LANE_2', terminalId: 'T1', name: 'Security Lane 2', type: ZoneType.SECURITY_LANE, capacityMax: 60, alertThresholdPct: 80 },
    { id: 'T1_SECURITY_LANE_3', terminalId: 'T1', name: 'Security Lane 3', type: ZoneType.SECURITY_LANE, capacityMax: 60, alertThresholdPct: 80 },
    { id: 'T1_IMMIGRATION', terminalId: 'T1', name: 'Immigration T1', type: ZoneType.IMMIGRATION, capacityMax: 80, alertThresholdPct: 75 },
    { id: 'T1_CHECKIN_A', terminalId: 'T1', name: 'Check-in Zone A', type: ZoneType.CHECK_IN, capacityMax: 200, alertThresholdPct: 70 },
    { id: 'T1_CHECKIN_B', terminalId: 'T1', name: 'Check-in Zone B', type: ZoneType.CHECK_IN, capacityMax: 180, alertThresholdPct: 70 },
    { id: 'T1_RETAIL_PLAZA', terminalId: 'T1', name: 'Retail Plaza T1', type: ZoneType.RETAIL, capacityMax: 300, alertThresholdPct: 85 },
    { id: 'T1_GATE_A05', terminalId: 'T1', name: 'Gate A05', type: ZoneType.BOARDING_GATE, capacityMax: 80, alertThresholdPct: 90 },
    { id: 'T1_GATE_A08', terminalId: 'T1', name: 'Gate A08', type: ZoneType.BOARDING_GATE, capacityMax: 80, alertThresholdPct: 90 },
    { id: 'T1_GATE_A12', terminalId: 'T1', name: 'Gate A12', type: ZoneType.BOARDING_GATE, capacityMax: 100, alertThresholdPct: 90 },
    { id: 'T1_GATE_B03', terminalId: 'T1', name: 'Gate B03', type: ZoneType.BOARDING_GATE, capacityMax: 80, alertThresholdPct: 90 },
    { id: 'T1_GATE_B08', terminalId: 'T1', name: 'Gate B08', type: ZoneType.BOARDING_GATE, capacityMax: 120, alertThresholdPct: 90 },
    { id: 'T1_CORRIDOR_POST_SECURITY', terminalId: 'T1', name: 'Post-Security Corridor', type: ZoneType.CORRIDOR, capacityMax: 150, alertThresholdPct: 80 },
    { id: 'T1_CORRIDOR_PIER_A', terminalId: 'T1', name: 'Pier A Corridor', type: ZoneType.CORRIDOR, capacityMax: 100, alertThresholdPct: 80 },
    { id: 'T1_CORRIDOR_PIER_B', terminalId: 'T1', name: 'Pier B Corridor', type: ZoneType.CORRIDOR, capacityMax: 100, alertThresholdPct: 80 },
    { id: 'T1_BAGGAGE_A', terminalId: 'T1', name: 'Baggage Reclaim A', type: ZoneType.BAGGAGE_RECLAIM, capacityMax: 100, alertThresholdPct: 85 },
    { id: 'T1_LANDSIDE', terminalId: 'T1', name: 'T1 Landside', type: ZoneType.LANDSIDE, capacityMax: 400, alertThresholdPct: 70 },
    // Terminal 2
    { id: 'T2_CHECKIN_B', terminalId: 'T2', name: 'Check-in Zone B', type: ZoneType.CHECK_IN, capacityMax: 160, alertThresholdPct: 70 },
    { id: 'T2_SECURITY_LANE_1', terminalId: 'T2', name: 'Security Lane 1', type: ZoneType.SECURITY_LANE, capacityMax: 60, alertThresholdPct: 80 },
    { id: 'T2_SECURITY_LANE_2', terminalId: 'T2', name: 'Security Lane 2', type: ZoneType.SECURITY_LANE, capacityMax: 60, alertThresholdPct: 80 },
    { id: 'T2_IMMIGRATION', terminalId: 'T2', name: 'Immigration T2', type: ZoneType.IMMIGRATION, capacityMax: 80, alertThresholdPct: 75 },
    { id: 'T2_RETAIL', terminalId: 'T2', name: 'Retail T2', type: ZoneType.RETAIL, capacityMax: 200, alertThresholdPct: 85 },
    { id: 'T2_GATE_C07', terminalId: 'T2', name: 'Gate C07', type: ZoneType.BOARDING_GATE, capacityMax: 80, alertThresholdPct: 90 },
    { id: 'T2_GATE_D11', terminalId: 'T2', name: 'Gate D11', type: ZoneType.BOARDING_GATE, capacityMax: 100, alertThresholdPct: 90 },
    { id: 'T2_CORRIDOR_POST_SECURITY', terminalId: 'T2', name: 'Post-Security T2', type: ZoneType.CORRIDOR, capacityMax: 120, alertThresholdPct: 80 },
  ];

  for (const zone of zones) {
    await prisma.zone.upsert({
      where: { id: zone.id },
      update: {},
      create: zone,
    });

    await prisma.zoneConfig.upsert({
      where: { zoneId: zone.id },
      update: {},
      create: {
        zoneId: zone.id,
        forecastThreshold30: zone.type === ZoneType.SECURITY_LANE ? 15 : 20,
        forecastThreshold60: zone.type === ZoneType.SECURITY_LANE ? 20 : 30,
        sentinelZScore: 2.5,
      },
    });
  }
  console.log(`✓ Seeded ${zones.length} zones with configs`);

  // ─── Zone Mappings (Wi-Fi AP → Zone) ────────────────────────────────────────
  const mappings = [
    { apLocationId: 'AP-T1-SEC-01', zoneId: 'T1_SECURITY_LANE_1', terminalId: 'T1' },
    { apLocationId: 'AP-T1-SEC-02', zoneId: 'T1_SECURITY_LANE_2', terminalId: 'T1' },
    { apLocationId: 'AP-T1-SEC-03', zoneId: 'T1_SECURITY_LANE_3', terminalId: 'T1' },
    { apLocationId: 'AP-T1-CHK-01', zoneId: 'T1_CHECKIN_A', terminalId: 'T1' },
    { apLocationId: 'AP-T1-CHK-02', zoneId: 'T1_CHECKIN_B', terminalId: 'T1' },
    { apLocationId: 'AP-T1-IMG-01', zoneId: 'T1_IMMIGRATION', terminalId: 'T1' },
    { apLocationId: 'AP-T2-SEC-01', zoneId: 'T2_SECURITY_LANE_1', terminalId: 'T2' },
    { apLocationId: 'AP-T2-SEC-02', zoneId: 'T2_SECURITY_LANE_2', terminalId: 'T2' },
    { apLocationId: 'AP-T2-CHK-01', zoneId: 'T2_CHECKIN_B', terminalId: 'T2' },
  ];

  for (const m of mappings) {
    await prisma.zoneMapping.upsert({
      where: { apLocationId: m.apLocationId },
      update: {},
      create: m,
    });
  }
  console.log(`✓ Seeded ${mappings.length} Wi-Fi zone mappings`);

  console.log('\n✅ Database seeding complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
