import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FlowService } from './flow.service';

@Controller('flow')
@UseGuards(AuthGuard('jwt'))
export class FlowController {
  constructor(private readonly flowService: FlowService) {}

  @Get('live')
  async getLive(
    @Query('terminalId') terminalId?: string,
    @Query('zoneType') zoneType?: string,
  ) {
    return this.flowService.getLiveSnapshot(terminalId, zoneType);
  }

  @Get('history')
  async getHistory(
    @Query('zoneId') zoneId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('bucket') bucket: '1min' | '5min' | '15min' | '1hour' = '15min',
  ) {
    if (!zoneId || !from || !to) {
      throw new BadRequestException('zoneId, from, and to are required');
    }
    return this.flowService.getHistory(zoneId, from, to, bucket);
  }

  @Get('heatmap')
  async getHeatmap(@Query('terminalId') terminalId?: string) {
    return this.flowService.getHeatmap(terminalId);
  }

  @Get('forecast')
  async getForecast(
    @Query('zoneId') zoneId?: string,
    @Query('terminalId') terminalId?: string,
  ) {
    return this.flowService.getForecasts(zoneId, terminalId);
  }
}
