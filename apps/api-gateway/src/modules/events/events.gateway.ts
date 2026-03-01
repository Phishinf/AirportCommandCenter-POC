import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { REDIS_TOKEN } from '../database/database.module';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(@Inject(REDIS_TOKEN) private readonly redis: Redis) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialised');
    this.startFlowBroadcast();
    this.startForecastBroadcast();
  }

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    this.logger.log(`Client connected: ${client.id}`);
    // In production: validate JWT here; disconnect if invalid
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:terminal')
  handleSubscribeTerminal(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { terminalId: string },
  ) {
    client.join(`terminal:${payload.terminalId}`);
    this.logger.log(
      `Client ${client.id} subscribed to terminal:${payload.terminalId}`,
    );
  }

  @SubscribeMessage('subscribe:zone')
  handleSubscribeZone(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { zoneId: string },
  ) {
    client.join(`zone:${payload.zoneId}`);
    this.logger.log(
      `Client ${client.id} subscribed to zone:${payload.zoneId}`,
    );
  }

  @SubscribeMessage('unsubscribe:all')
  handleUnsubscribeAll(@ConnectedSocket() client: Socket) {
    const rooms = [...client.rooms].filter((r) => r !== client.id);
    rooms.forEach((room) => client.leave(room));
    this.logger.log(`Client ${client.id} unsubscribed from all rooms`);
  }

  // ─── Broadcast helpers ──────────────────────────────────────────

  emitFlowUpdate(payload: unknown) {
    this.server.emit('flow:update', payload);
  }

  emitNewAlert(alert: unknown) {
    this.server.emit('alert:new', alert);
  }

  emitAlertResolved(payload: { anomalyId: string; resolvedAt: string }) {
    this.server.emit('alert:resolved', payload);
  }

  emitForecastUpdate(payload: unknown) {
    this.server.emit('forecast:update', payload);
  }

  emitRecommendation(payload: unknown) {
    this.server.emit('recommendation:new', payload);
  }

  emitThresholdBreach(payload: unknown) {
    this.server.emit('threshold:breach', payload);
  }

  // ─── Scheduled broadcasts ───────────────────────────────────────

  private startFlowBroadcast() {
    setInterval(async () => {
      try {
        // Scan for all occupancy keys in Redis and broadcast a snapshot
        const keys = await this.redis.keys('nexus:occupancy:*');
        if (keys.length === 0) return;

        const values = await Promise.all(
          keys.map(async (key) => {
            const raw = await this.redis.get(key);
            if (!raw) return null;
            try {
              const data = JSON.parse(raw);
              const zoneId = key.replace('nexus:occupancy:', '');
              return {
                zoneId,
                occupancyPct: data.occupancyPct ?? 0,
                status: data.status ?? 'NORMAL',
              };
            } catch {
              return null;
            }
          }),
        );

        const zones = values.filter(Boolean);
        if (zones.length > 0) {
          this.server.emit('flow:update', {
            zones,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        this.logger.warn('Flow broadcast error: ' + (err as Error).message);
      }
    }, 5000); // every 5 seconds
  }

  private startForecastBroadcast() {
    setInterval(async () => {
      try {
        const keys = await this.redis.keys('nexus:forecast:*');
        if (keys.length === 0) return;

        const forecasts = await Promise.all(
          keys.map(async (key) => {
            const raw = await this.redis.get(key);
            return raw ? JSON.parse(raw) : null;
          }),
        );

        const valid = forecasts.filter(Boolean);
        if (valid.length > 0) {
          this.server.emit('forecast:update', { forecasts: valid });
        }
      } catch (err) {
        this.logger.warn('Forecast broadcast error: ' + (err as Error).message);
      }
    }, 60000); // every 60 seconds
  }
}
