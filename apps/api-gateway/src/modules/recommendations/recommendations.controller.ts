import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecommendationsService } from './recommendations.service';

@Controller('recommendations')
@UseGuards(AuthGuard('jwt'))
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get('latest')
  async getLatest(@Query('terminalId') terminalId?: string) {
    return this.recommendationsService.getLatest(terminalId);
  }
}
