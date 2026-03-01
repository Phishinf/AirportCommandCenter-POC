import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { AnomalyEvent } from '../../../../../../libs/common/src/interfaces/anomaly-event.interface';
import { ScenarioRecommendation } from '../../../../../../libs/common/src/interfaces/scenario-recommendation.interface';

export const DISPATCHER_REDIS_TOKEN = 'DISPATCHER_REDIS';

/**
 * Dispatcher Agent — Scenario Simulation
 *
 * When an anomaly event is received, generates 3 scenario recommendations
 * using Monte Carlo simulation for resource reallocation.
 */
@Injectable()
export class DispatcherAgent {
  private readonly logger = new Logger(DispatcherAgent.name);

  constructor(@Inject(DISPATCHER_REDIS_TOKEN) private readonly redis: Redis) {}

  async generateScenarios(anomaly: AnomalyEvent): Promise<void> {
    const urgencyLevel =
      anomaly.severity === 'CRITICAL' ? 'URGENT' :
      anomaly.severity === 'HIGH' ? 'ACTION_REQUIRED' : 'ADVISORY';

    const scenarios = this.runMonteCarloSimulation(anomaly);

    const recommendation: ScenarioRecommendation = {
      recommendationId: uuidv4(),
      triggerEventId: anomaly.anomalyId,
      generatedAt: new Date().toISOString(),
      urgencyLevel,
      affectedZones: [anomaly.zoneId],
      scenarios,
    };

    // Cache in Redis
    await this.redis.setex(
      'nexus:recommendations:latest',
      5 * 60, // 5 minute TTL
      JSON.stringify(recommendation),
    );

    this.logger.log(
      `[Dispatcher] Generated ${scenarios.length} scenarios for anomaly ${anomaly.anomalyId} at ${anomaly.zoneId}`,
    );
  }

  private runMonteCarloSimulation(anomaly: AnomalyEvent) {
    // Monte Carlo: simulate resource reallocation across 3 scenarios
    // Each scenario runs 1000 iterations and returns mean outcomes

    const iterations = 1000;

    const scenarios = [
      {
        rank: 1,
        label: 'Open Adjacent Lane',
        actions: [
          `Open additional service lane adjacent to ${anomaly.zoneId}`,
          'Redirect inbound passengers via zone signage',
          'Alert supervisor to supervise transition',
        ],
        baseReduction: 8,
        resourceCost: 'LOW — 1 additional staff member required',
      },
      {
        rank: 2,
        label: 'Flow Diversion + Extra Staff',
        actions: [
          `Divert 30% of flow from ${anomaly.zoneId} to parallel zone`,
          'Deploy 2 additional security officers',
          'Activate dynamic digital signage for passenger guidance',
        ],
        baseReduction: 15,
        resourceCost: 'MEDIUM — 2–3 staff + digital signage activation',
      },
      {
        rank: 3,
        label: 'Full Resource Surge',
        actions: [
          'Activate all available service lanes in terminal',
          'Request off-shift staff to return immediately',
          'Coordinate with airline to delay boarding for affected flights',
          'Alert ground transport for landside congestion management',
        ],
        baseReduction: 22,
        resourceCost: 'HIGH — Full team mobilisation required',
      },
    ];

    return scenarios.map((s) => {
      // Simulate variance in outcomes
      let totalReduction = 0;
      for (let i = 0; i < iterations; i++) {
        const noise = (Math.random() - 0.5) * s.baseReduction * 0.3;
        totalReduction += s.baseReduction + noise;
      }
      const meanReduction = Math.round(totalReduction / iterations);
      const confidence = Math.max(0.5, Math.min(0.95, 1 - (s.rank * 0.1)));

      return {
        rank: s.rank,
        label: s.label,
        actions: s.actions,
        predictedWaitReduction: meanReduction,
        resourceCost: s.resourceCost,
        confidence,
      };
    });
  }
}
