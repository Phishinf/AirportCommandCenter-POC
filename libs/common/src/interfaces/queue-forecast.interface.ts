export interface ForecastHorizon {
  predictedWaitMinutes: number;
  confidence: number; // 0–1
}

export interface QueueForecast {
  zoneId: string;
  generatedAt: string; // ISO 8601
  horizons: {
    t30: ForecastHorizon;
    t60: ForecastHorizon;
    t90: ForecastHorizon;
  };
  flightCorrelations: string[]; // flight refs affecting this zone
}

export interface ThresholdBreachEvent {
  breachId: string;
  zoneId: string;
  terminalId: string;
  horizon: 't30' | 't60' | 't90';
  predictedWaitMinutes: number;
  thresholdMinutes: number;
  detectedAt: string;
}
