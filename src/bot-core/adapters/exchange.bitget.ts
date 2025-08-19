import { ExchangeGateway } from '../interfaces';
import { toBitgetSymbolId } from '../utils';
import { BitgetService } from '../../integrations/bitget/bitget.service';

export class BitgetExchangeGateway implements ExchangeGateway {
  constructor(private readonly svc: BitgetService) {}
  isAllowed(symbolId: string) {
    return this.svc.isAllowed(symbolId);
  }
  async ensureLeverage(symbolId: string, leverage: string) {
    await this.svc.ensureLeverage(symbolId, leverage);
  }
  async calcSizeFromUsd(
    symbolId: string,
    lastPrice: number,
    usdAmount: number,
  ) {
    return this.svc.calcSizeFromUsd(symbolId, lastPrice, usdAmount);
  }
  async placeMarket(
    symbolId: string,
    side: 'buy' | 'sell',
    size: string,
    oid?: string,
  ) {
    await this.svc.placeMarket(symbolId, side, size, oid);
  }
  async flashClose(symbol: string, holdSide?: 'long') {
    await this.svc.flashClose(symbol, holdSide);
  }
  static id(sym: string) {
    return toBitgetSymbolId(sym);
  }
}
