export interface ThresholdBreachPayload {
  breachId: string;
  zoneId: string;
  terminalId: string;
  horizon: 't30' | 't60' | 't90';
  predictedWaitMinutes: number;
  thresholdMinutes: number;
  detectedAt: string;
}
