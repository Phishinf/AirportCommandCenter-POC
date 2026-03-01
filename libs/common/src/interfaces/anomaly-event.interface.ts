export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AnomalyEvent {
  anomalyId: string;
  zoneId: string;
  terminalId: string;
  anomalyType:
    | 'OCCUPANCY_SPIKE'
    | 'WAIT_TIME_BREACH'
    | 'FLOW_DEVIANCE'
    | 'CAMERA_ALERT'
    | 'THRESHOLD_BREACH';
  severity: AlertSeverity;
  detectedAt: string; // ISO 8601
  description: string;
  zScore?: number;
  observedValue?: number;
  baselineValue?: number;
  recommendedAction?: string;
  sourceEventIds?: string[];
}
