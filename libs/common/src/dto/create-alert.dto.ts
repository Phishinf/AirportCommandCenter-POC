import { AlertSeverity } from '../interfaces/anomaly-event.interface';

export class CreateAlertDto {
  anomalyId: string;
  zoneId: string;
  terminalId: string;
  anomalyType: string;
  severity: AlertSeverity;
  detectedAt: string;
  description: string;
}
