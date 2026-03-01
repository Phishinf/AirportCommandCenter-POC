import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GraphService } from './graph.service';

@Controller('graph')
@UseGuards(AuthGuard('jwt'))
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get('topology')
  async getTopology(@Query('terminalId') terminalId?: string) {
    return this.graphService.getTopology(terminalId);
  }
}
