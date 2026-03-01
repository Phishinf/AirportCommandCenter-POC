import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_TOKEN } from '../database/database.module';
import { v4 as uuidv4 } from 'uuid';

interface LlmQueryRequest {
  query: string;
  context?: { terminalId?: string; zoneId?: string };
}

@Injectable()
export class LlmQueryService {
  constructor(@Inject(REDIS_TOKEN) private readonly redis: Redis) {}

  async query(request: LlmQueryRequest) {
    const { query, context } = request;

    // Build airport context from Redis
    const liveContext = await this.buildLiveContext(context);

    const systemPrompt = `You are Nexus, an AI assistant for airport operations command centres.
You have access to real-time airport data. Answer operator queries concisely and actionably.

Current airport state:
${liveContext}

Guidelines:
- Focus on actionable insights for airport operations
- Reference specific zones, terminals, and metrics when relevant
- Flag critical situations clearly
- Suggest concrete operational responses`;

    const answer = await this.callGemini(systemPrompt, query);

    return {
      answer,
      dataReferences: this.extractDataReferences(liveContext),
      generatedAt: new Date().toISOString(),
    };
  }

  private async buildLiveContext(
    context?: { terminalId?: string; zoneId?: string },
  ): Promise<string> {
    const parts: string[] = [];

    // Fetch active alerts
    const alerts = await this.redis.lrange('nexus:alerts:active', 0, 9);
    if (alerts.length > 0) {
      parts.push(`Active Alerts (${alerts.length}):`);
      alerts.slice(0, 3).forEach((a) => {
        try {
          const alert = JSON.parse(a);
          parts.push(
            `  - [${alert.severity}] ${alert.zoneId}: ${alert.description}`,
          );
        } catch {
          // skip malformed
        }
      });
    } else {
      parts.push('Active Alerts: None');
    }

    // Fetch flight schedule
    const schedule = await this.redis.get('nexus:flight-schedule:next3h');
    if (schedule) {
      try {
        const flights = JSON.parse(schedule);
        parts.push(
          `Upcoming Flights (next 3h): ${Array.isArray(flights) ? flights.length : 'N/A'} departures`,
        );
      } catch {
        // skip
      }
    }

    // Fetch specific zone forecast if requested
    if (context?.zoneId) {
      const forecast = await this.redis.get(`nexus:forecast:${context.zoneId}`);
      if (forecast) {
        try {
          const f = JSON.parse(forecast);
          parts.push(
            `Zone ${context.zoneId} Forecast: T+30min=${f.horizons?.t30?.predictedWaitMinutes}min, T+60min=${f.horizons?.t60?.predictedWaitMinutes}min`,
          );
        } catch {
          // skip
        }
      }
    }

    return parts.join('\n');
  }

  private async callGemini(
    systemPrompt: string,
    userQuery: string,
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return `[LLM Unavailable — no API key configured] Query received: "${userQuery}". Please configure GEMINI_API_KEY to enable natural language queries.`;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: systemPrompt + '\n\nOperator Query: ' + userQuery },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 512,
            },
          }),
        },
      );

      const data = await response.json() as any;
      return (
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        'Unable to generate response.'
      );
    } catch (err) {
      return `Error calling LLM: ${(err as Error).message}`;
    }
  }

  private extractDataReferences(
    context: string,
  ): Array<{ type: string; id: string; summary: string }> {
    const refs: Array<{ type: string; id: string; summary: string }> = [];

    if (context.includes('Active Alerts')) {
      refs.push({ type: 'alert', id: uuidv4(), summary: 'Active alert data' });
    }
    if (context.includes('Upcoming Flights')) {
      refs.push({ type: 'flight', id: uuidv4(), summary: 'Flight schedule' });
    }
    if (context.includes('Forecast')) {
      refs.push({ type: 'forecast', id: uuidv4(), summary: 'Queue forecast data' });
    }

    return refs;
  }
}
