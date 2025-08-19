import { TrendProvider } from '../interfaces';
import { TrendService } from '../../trend/trend.service';

export class TrendServiceProvider implements TrendProvider {
  constructor(private readonly svc: TrendService) {}

  getCurrent(symbol: string, timeframe: string) {
    return this.svc.getCurrentTrend(symbol, timeframe);
  }

  agreeAll(symbol: string, tfs: string[]) {
    return this.svc.agreeAll(symbol, tfs);
  }

  agreeAllWithHierarchy(symbol: string, timeframes: string[]) {
    return this.svc.agreeAllWithHierarchy(symbol, timeframes);
  }

  canAddPosition(
    symbol: string,
    timeframes: string[],
    expectedDirection: 'long' | 'short',
  ) {
    return this.svc.canAddPosition(symbol, timeframes, expectedDirection);
  }

  shouldClosePosition(
    symbol: string,
    timeframes: string[],
    currentDirection: 'long' | 'short',
  ) {
    return this.svc.shouldClosePosition(symbol, timeframes, currentDirection);
  }
}
