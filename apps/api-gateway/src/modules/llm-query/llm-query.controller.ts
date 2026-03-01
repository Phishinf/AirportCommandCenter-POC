import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LlmQueryService } from './llm-query.service';

class LlmContextDto {
  @IsString()
  @IsOptional()
  terminalId?: string;

  @IsString()
  @IsOptional()
  zoneId?: string;
}

class LlmQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmContextDto)
  context?: LlmContextDto;
}

@Controller('llm')
@UseGuards(AuthGuard('jwt'))
export class LlmQueryController {
  constructor(private readonly llmQueryService: LlmQueryService) {}

  @Post('query')
  async query(@Body() body: LlmQueryDto) {
    return this.llmQueryService.query(body);
  }
}
