import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { TrendService } from './trend.service';

@Controller('/trend')
export class TrendController {
  constructor(private readonly trend: TrendService) {}

  @Post('/confirm')
  async confirm(
    @Body()
    b: {
      symbol: string;
      timeframe: string;
      direction: 'long' | 'short';
      source?: string;
      meta?: any;
    },
  ) {
    const r = await this.trend.confirm(b);
    return { ok: true, expiresAt: r.expiresAt };
  }

  @Get('/current')
  async getCurrentTrend(
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: string,
  ) {
    const trend = await this.trend.getCurrentTrend(symbol, timeframe);
    return { symbol, timeframe, trend };
  }

  @Get('/agree')
  async agreeAll(
    @Query('symbol') symbol: string,
    @Query('timeframes') timeframes: string,
  ) {
    const tfArray = timeframes.split(',').map((t) => t.trim());
    const trend = await this.trend.agreeAll(symbol, tfArray);
    return { symbol, timeframes: tfArray, trend };
  }
}
