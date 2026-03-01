export interface FlowEvent {
  eventId: string;
  timestamp: string; // ISO 8601
  zoneId: string;
  terminalId: string;
  sourceSystem: 'WIFI' | 'XOVIS' | 'IPSOTEK' | 'AODB' | 'FIDS';
  occupancyAbsolute: number;
  passengerCountDelta: number;
  anonymisedDeviceId?: string; // SHA-256 hashed MAC
  flightRef?: string;
  metadata?: Record<string, unknown>;
}

export interface LiveZoneSnapshot {
  zoneId: string;
  terminalId: string;
  zoneType: string;
  occupancyAbsolute: number;
  capacityMax: number;
  occupancyPct: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  updatedAt: string;
}

export interface FlowUpdatePayload {
  zones: Array<{
    zoneId: string;
    occupancyPct: number;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  }>;
  timestamp: string;
}
