import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsOptional } from 'class-validator';
import { AlertsService } from './alerts.service';

class ResolveAlertDto {
  @IsString()
  resolvedBy: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

@Controller('alerts')
@UseGuards(AuthGuard('jwt'))
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('active')
  async getActiveAlerts() {
    return this.alertsService.getActiveAlerts();
  }

  @Patch(':anomalyId/resolve')
  async resolveAlert(
    @Param('anomalyId') anomalyId: string,
    @Body() body: ResolveAlertDto,
  ) {
    return this.alertsService.resolveAlert(anomalyId, body.resolvedBy, body.notes);
  }
}
