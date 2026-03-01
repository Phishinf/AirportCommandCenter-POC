export type UrgencyLevel = 'ADVISORY' | 'ACTION_REQUIRED' | 'URGENT';

export interface ScenarioOption {
  rank: number;
  label: string;
  actions: string[];
  predictedWaitReduction: number; // minutes
  resourceCost: string;
  confidence: number; // 0–1
}

export interface ScenarioRecommendation {
  recommendationId: string;
  triggerEventId: string;
  generatedAt: string; // ISO 8601
  urgencyLevel: UrgencyLevel;
  affectedZones: string[];
  scenarios: ScenarioOption[];
}
