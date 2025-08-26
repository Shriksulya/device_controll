export type SmartVolType =
  | 'SmartOpen'
  | 'SmartVolAdd'
  | 'SmartClose'
  | 'SmartBigClose'
  | 'SmartBigAdd'
  | 'SmartVolumeOpen'
  | 'BullishVolume'
  | 'VolumeUp';

// Новые типы алертов для трендовой стратегии
export type TrendPivotType =
  | 'long trend'
  | 'short trend'
  | 'long pivot point'
  | 'short pivot point'
  | 'strong long pivot point'
  | 'strong short pivot point';

export type BaseAlert = {
  kind: 'smartvol';
  symbol: string;
  price: string;
  timeframe?: string;
};

// Базовый алерт для трендовой стратегии
export type BaseTrendAlert = {
  kind: 'trend-pivot';
  symbol: string;
  price: string;
  timeframe?: string;
};

export type SmartOpenAlert = BaseAlert & { type: 'SmartOpen' };
export type SmartVolAddAlert = BaseAlert & { type: 'SmartVolAdd' };
export type SmartCloseAlert = BaseAlert & { type: 'SmartClose' };
export type SmartBigCloseAlert = BaseAlert & { type: 'SmartBigClose' };
export type SmartBigAddAlert = BaseAlert & { type: 'SmartBigAdd' };
export type SmartVolumeOpenAlert = BaseAlert & { type: 'SmartVolumeOpen' };
export type BullishVolumeAlert = BaseAlert & { type: 'BullishVolume' };
export type VolumeUpAlert = BaseAlert & {
  type: 'VolumeUp';
  volume: number;
  timeframe: string;
};

// Новые типы алертов для трендовой стратегии
export type LongTrendAlert = BaseTrendAlert & { type: 'long trend' };
export type ShortTrendAlert = BaseTrendAlert & { type: 'short trend' };
export type LongPivotPointAlert = BaseTrendAlert & { type: 'long pivot point' };
export type ShortPivotPointAlert = BaseTrendAlert & {
  type: 'short pivot point';
};
export type StrongLongPivotPointAlert = BaseTrendAlert & {
  type: 'strong long pivot point';
};
export type StrongShortPivotPointAlert = BaseTrendAlert & {
  type: 'strong short pivot point';
};

export type Alert =
  | SmartOpenAlert
  | SmartVolAddAlert
  | SmartCloseAlert
  | SmartBigCloseAlert
  | SmartBigAddAlert
  | SmartVolumeOpenAlert
  | BullishVolumeAlert
  | VolumeUpAlert
  | LongTrendAlert
  | ShortTrendAlert
  | LongPivotPointAlert
  | ShortPivotPointAlert
  | StrongLongPivotPointAlert
  | StrongShortPivotPointAlert;

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
    expectedDirection: 'long' | 'short' | 'both',
  ): Promise<boolean>;
  shouldClosePosition(
    symbol: string,
    timeframes: string[],
    currentDirection: 'long' | 'short' | 'both',
  ): Promise<boolean>;
}
export interface Strategy {
  onOpen(bot: any, alert: SmartOpenAlert): Promise<void>;
  onAdd(bot: any, alert: SmartVolAddAlert): Promise<void>;
  onClose(bot: any, alert: SmartCloseAlert): Promise<void>;
  onBigClose(bot: any, alert: SmartBigCloseAlert): Promise<void>;
  onBigAdd(bot: any, alert: SmartBigAddAlert): Promise<void>;
  onSmartVolumeOpen(bot: any, alert: SmartVolumeOpenAlert): Promise<void>;
  onBullishVolume(bot: any, alert: BullishVolumeAlert): Promise<void>;
  onVolumeUp(bot: any, alert: VolumeUpAlert): Promise<void>;
}
export type BotConfig = {
  name: string;
  enabled: boolean;
  based_on_default_logic: boolean;
  strategy?: string | null;
  prod: boolean;
  is_trended: boolean;
  direction: 'long' | 'short' | 'both';
  // Первое значение - для проверки тренда, второе - для SmartVolOpen
  timeframe_trend: string[];
  symbol_filter?: string[];
  scheduled_notification: boolean;
  scheduled_time: string | null;
  exchange_profile: 'BITGET' | 'BITGET2';
  telegram_channel: 'bot1' | 'bot2' | 'bot3' | 'bot4' | 'domination';
  smartvol?: { baseUsd: number; addFraction: number; leverage: number } | null;
  maxFills?: number;
};
