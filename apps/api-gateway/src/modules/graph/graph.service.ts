import { Injectable, Inject } from '@nestjs/common';
import { Driver } from 'neo4j-driver';
import { NEO4J_TOKEN } from '../database/database.module';

@Injectable()
export class GraphService {
  constructor(@Inject(NEO4J_TOKEN) private readonly neo4j: Driver) {}

  async getTopology(terminalId?: string) {
    const session = this.neo4j.session();
    try {
      // Fetch zone nodes
      const nodeQuery = terminalId
        ? `MATCH (z:Zone {terminalId: $terminalId}) RETURN z`
        : `MATCH (z:Zone) RETURN z`;

      const nodeResult = await session.run(nodeQuery, { terminalId });

      const nodes = nodeResult.records.map((r) => {
        const z = r.get('z').properties;
        return {
          id: z.id as string,
          name: z.name as string,
          type: z.type as string,
          x: z.x?.toNumber?.() ?? (z.x as number) ?? 0,
          y: z.y?.toNumber?.() ?? (z.y as number) ?? 0,
          terminalId: z.terminalId as string,
          capacityMax: z.capacityMax?.toNumber?.() ?? (z.capacityMax as number) ?? 0,
        };
      });

      // Fetch edges
      const edgeQuery = terminalId
        ? `
          MATCH (a:Zone {terminalId: $terminalId})-[r:CONNECTS_TO]->(b:Zone {terminalId: $terminalId})
          RETURN a.id AS from, b.id AS to, r.walkTimeSeconds AS walkTimeSeconds, r.isActive AS isActive
        `
        : `
          MATCH (a:Zone)-[r:CONNECTS_TO]->(b:Zone)
          RETURN a.id AS from, b.id AS to, r.walkTimeSeconds AS walkTimeSeconds, r.isActive AS isActive
        `;

      const edgeResult = await session.run(edgeQuery, { terminalId });

      const edges = edgeResult.records.map((r) => ({
        from: r.get('from') as string,
        to: r.get('to') as string,
        walkTimeSeconds: r.get('walkTimeSeconds')?.toNumber?.() ?? 0,
        isActive: r.get('isActive') as boolean,
      }));

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }
}
