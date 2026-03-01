#!/usr/bin/env ts-node
/**
 * Nexus Aviation Suite — Kafka Event Producer
 * Publishes synthetic sensor events to Kafka topics for testing.
 *
 * Usage: npx ts-node tools/simulators/kafka-producer.ts [--rate=10] [--topic=raw.xovis]
 */

import { Kafka, Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'localhost:9092';

const ZONES = [
  { id: 'T1_SECURITY_LANE_1', terminalId: 'T1' },
  { id: 'T1_SECURITY_LANE_2', terminalId: 'T1' },
  { id: 'T1_IMMIGRATION', terminalId: 'T1' },
  { id: 'T2_SECURITY_LANE_1', terminalId: 'T2' },
  { id: 'T2_IMMIGRATION', terminalId: 'T2' },
];

async function startProducer(ratePerSecond: number, topic: string) {
  const kafka = new Kafka({
    clientId: 'nexus-simulator',
    brokers: [KAFKA_BROKER],
  });

  const producer = kafka.producer();
  await producer.connect();

  console.log(`Publishing to ${topic} at ${ratePerSecond} events/s on ${KAFKA_BROKER}`);
  console.log('Press Ctrl+C to stop.\n');

  const intervalMs = Math.floor(1000 / ratePerSecond);
  let count = 0;

  const interval = setInterval(async () => {
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    const occupancy = Math.floor(Math.random() * 60) + 10;

    const event = {
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      zoneId: zone.id,
      terminalId: zone.terminalId,
      occupancyAbsolute: occupancy,
      passengerCountDelta: Math.floor((Math.random() - 0.5) * 10),
      source: 'XOVIS',
    };

    try {
      await producer.send({
        topic,
        messages: [{ key: zone.id, value: JSON.stringify(event) }],
      });
      count++;
      if (count % 100 === 0) {
        process.stdout.write(`\r[${new Date().toISOString()}] Published ${count} events`);
      }
    } catch (err) {
      console.error(`\nPublish error: ${(err as Error).message}`);
    }
  }, intervalMs);

  process.on('SIGINT', async () => {
    clearInterval(interval);
    await producer.disconnect();
    console.log(`\n\nPublished ${count} total events. Disconnected.`);
    process.exit(0);
  });
}

const args = process.argv.slice(2);
const rate = parseInt(args.find((a) => a.startsWith('--rate='))?.split('=')[1] ?? '5');
const topic = args.find((a) => a.startsWith('--topic='))?.split('=')[1] ?? 'raw.xovis';

startProducer(rate, topic).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
