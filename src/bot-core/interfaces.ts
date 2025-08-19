export type SmartVolType = 'SmartVolOpen' | 'SmartVolAdd' | 'SmartVolClose';

export type BaseAlert = {
  kind: 'smartvol';
  symbol: string;
  price: string;
  timeframe?: string;
};

export type SmartVolOpenAlert = BaseAlert & { type: 'SmartVolOpen' };
export type SmartVolAddAlert = BaseAlert & { type: 'SmartVolAdd' };
export type SmartVolCloseAlert = BaseAlert & { type: 'SmartVolClose' };

export type Alert = SmartVolOpenAlert | SmartVolAddAlert | SmartVolCloseAlert;

export interface ExchangeGateway {
  ensureLeverage?(symbolId: string, leverage: string): Promise<void>;
  calcSizeFromUsd?(
    symbolId: string,
    lastPrice: number,
    usdAmount: number,
  ): Promise<string>;
  placeMarket?(
    symbolId: string,
    side: 'buy' | 'sell',
    size: string,
    oid?: string,
  ): Promise<void>;
  flashClose?(symbol: string, holdSide?: 'long' | 'short'): Promise<any>;
  isAllowed?(symbolId: string): boolean;
}
export interface Notifier {
  send(text: string): Promise<void>;
}
export interface TrendProvider {
  getCurrent(
    symbol: string,
    timeframe: string,
  ): Promise<'long' | 'short' | 'neutral'>;
  agreeAll(
    symbol: string,
    timeframes: string[],
  ): Promise<'long' | 'short' | 'neutral'>;
  agreeAllWithHierarchy(
    symbol: string,
    timeframes: string[],
  ): Promise<'long' | 'short' | 'neutral'>;
  canAddPosition(
    symbol: string,
    timeframes: string[],
    expectedDirection: 'long' | 'short',
  ): Promise<boolean>;
  shouldClosePosition(
    symbol: string,
    timeframes: string[],
    currentDirection: 'long' | 'short',
  ): Promise<boolean>;
}
export interface Strategy {
  onOpen(bot: any, alert: SmartVolOpenAlert): Promise<void>;
  onAdd(bot: any, alert: SmartVolAddAlert): Promise<void>;
  onClose(bot: any, alert: SmartVolCloseAlert): Promise<void>;
}
export type BotConfig = {
  name: string;
  enabled: boolean;
  based_on_default_logic: boolean;
  strategy?: string | null;
  prod: boolean;
  is_trended: boolean;
  direction: 'long' | 'short';
  // Первое значение - для проверки тренда, второе - для SmartVolOpen
  timeframe_trend: string[];
  symbol_filter?: string[];
  scheduled_notification: boolean;
  scheduled_time: string | null;
  exchange_profile: 'BITGET' | 'BITGET2';
  telegram_channel: 'bot1' | 'bot2' | 'bot3' | 'bot4';
  smartvol: { baseUsd: number; addFraction: number; leverage: number };
  maxFills?: number;
};
