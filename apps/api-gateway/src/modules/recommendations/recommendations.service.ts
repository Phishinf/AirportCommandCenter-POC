import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_TOKEN } from '../database/database.module';

@Injectable()
export class RecommendationsService {
  constructor(@Inject(REDIS_TOKEN) private readonly redis: Redis) {}

  async getLatest(terminalId?: string) {
    const cached = await this.redis.get('nexus:recommendations:latest');
    if (!cached) {
      return { recommendation: null };
    }

    const recommendation = JSON.parse(cached);

    if (terminalId && recommendation?.affectedZones) {
      const isRelevant = recommendation.affectedZones.some((z: string) =>
        z.startsWith(terminalId),
      );
      if (!isRelevant) return { recommendation: null };
    }

    return { recommendation };
  }
}
