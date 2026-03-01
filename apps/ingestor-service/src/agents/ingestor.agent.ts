import { Injectable, Inject, Logger } from '@nestjs/common';
import { Producer } from 'kafkajs';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { KAFKA_PRODUCER_TOKEN } from '../kafka/kafka.module';
import { TIMESCALE_TOKEN, REDIS_TOKEN } from '../infrastructure/infrastructure.module';
import { anonymiseDeviceId } from '../middleware/anonymise.middleware';

export interface RawEvent {
  source: 'WIFI' | 'XOVIS' | 'IPSOTEK' | 'AODB' | 'FIDS';
  zoneId: string;
  terminalId: string;
  apLocationId?: string;
  macAddress?: string;
  occupancyAbsolute?: number;
  passengerCountDelta?: number;
  eventType?: string;
  flightRef?: string;
  rssi?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class IngestorAgent {
  private readonly logger = new Logger(IngestorAgent.name);

  constructor(
    @Inject(KAFKA_PRODUCER_TOKEN) private readonly producer: Producer,
    @Inject(TIMESCALE_TOKEN) private readonly timescale: Pool,
    @Inject(REDIS_TOKEN) private readonly redis: Redis,
  ) {}

  async processRawEvent(rawEvent: RawEvent): Promise<void> {
    const eventId = uuidv4();
    const timestamp = new Date().toISOString();

    // Anonymise MAC address if present
    const anonymisedDeviceId = rawEvent.macAddress
      ? anonymiseDeviceId(rawEvent.macAddress)
      : undefined;

    const flowEvent = {
      eventId,
      timestamp,
      zoneId: rawEvent.zoneId,
      terminalId: rawEvent.terminalId,
      sourceSystem: rawEvent.source,
      occupancyAbsolute: rawEvent.occupancyAbsolute ?? 0,
      passengerCountDelta: rawEvent.passengerCountDelta ?? 0,
      anonymisedDeviceId,
      flightRef: rawEvent.flightRef,
      metadata: rawEvent.metadata,
    };

    // Write to TimescaleDB
    await this.writeToTimescale(flowEvent);

    // Update Redis occupancy cache
    await this.updateRedisCache(flowEvent);

    // Publish normalised event to Kafka
    await this.producer.send({
      topic: 'events.flow',
      messages: [
        {
          key: rawEvent.zoneId,
          value: JSON.stringify(flowEvent),
        },
      ],
    });

    // If it's a Wi-Fi event, also write to wifi_events table
    if (rawEvent.source === 'WIFI' && rawEvent.apLocationId && anonymisedDeviceId) {
      await this.writeWifiEvent({
        timestamp,
        apLocationId: rawEvent.apLocationId,
        zoneId: rawEvent.zoneId,
        eventType: rawEvent.eventType ?? 'ASSOCIATION',
        anonymisedDeviceId,
        rssi: rawEvent.rssi,
      });
    }
  }

  private async writeToTimescale(event: {
    timestamp: string;
    zoneId: string;
    terminalId: string;
    sourceSystem: string;
    occupancyAbsolute: number;
    passengerCountDelta: number;
    anonymisedDeviceId?: string;
    flightRef?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.timescale.query(
        `INSERT INTO flow_metrics
          (time, zone_id, terminal_id, source_system, occupancy_absolute,
           passenger_count_delta, anonymised_device_id, flight_ref, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          event.timestamp,
          event.zoneId,
          event.terminalId,
          event.sourceSystem,
          event.occupancyAbsolute,
          event.passengerCountDelta,
          event.anonymisedDeviceId ?? null,
          event.flightRef ?? null,
          event.metadata ? JSON.stringify(event.metadata) : null,
        ],
      );
    } catch (err) {
      this.logger.error(`TimescaleDB write failed: ${(err as Error).message}`);
    }
  }

  private async updateRedisCache(event: {
    zoneId: string;
    terminalId: string;
    occupancyAbsolute: number;
    timestamp: string;
  }) {
    const occupancyPct = Math.min(
      Math.round((event.occupancyAbsolute / 100) * 100), // placeholder — real capacity from DB
      100,
    );

    const status =
      occupancyPct >= 90 ? 'CRITICAL' : occupancyPct >= 80 ? 'WARNING' : 'NORMAL';

    const payload = {
      occupancy: event.occupancyAbsolute,
      occupancyPct,
      status,
      updatedAt: event.timestamp,
    };

    await this.redis.setex(
      `nexus:occupancy:${event.zoneId}`,
      30, // 30 second TTL
      JSON.stringify(payload),
    );
  }

  private async writeWifiEvent(event: {
    timestamp: string;
    apLocationId: string;
    zoneId: string;
    eventType: string;
    anonymisedDeviceId: string;
    rssi?: number;
  }) {
    try {
      await this.timescale.query(
        `INSERT INTO wifi_events
          (time, ap_location_id, zone_id, event_type, anonymised_device_id, rssi)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.timestamp,
          event.apLocationId,
          event.zoneId,
          event.eventType,
          event.anonymisedDeviceId,
          event.rssi ?? null,
        ],
      );
    } catch (err) {
      this.logger.warn(`Wi-Fi event write failed: ${(err as Error).message}`);
    }
  }
}
