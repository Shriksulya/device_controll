import { ExchangeGateway } from '../interfaces';
export class NoopExchange implements ExchangeGateway {
  isAllowed() {
    return true;
  }
  async ensureLeverage() {}
  async calcSizeFromUsd() {
    return '0';
  }
  async placeMarket() {}
  async flashClose() {}
}
