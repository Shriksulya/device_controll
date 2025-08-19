export type TrendDirection = 'long' | 'short';
export type TrendEntry = {
  symbol: string;
  timeframe: string; // '1m','5m','15m','1h','4h','1d','1w'
  direction: TrendDirection;
  createdAt: number; // ms
  expiresAt: number; // ms
  source?: string; // опционально
  meta?: Record<string, any> | null; // опционально
};

export type TrendAlertName =
  | 'ExitSell'
  | 'ExitBuy'
  | 'SSL2 Cross Alert'
  | 'SSL Cross Alert'
  | 'Sell Continuation'
  | 'Buy Continuation'
  | 'Strong Short Entry'
  | 'Strong Long Entry';

export interface TrendAlertMeta {
  name: TrendAlertName;
  [key: string]: any;
}

export interface TrendConfirmationArgs {
  symbol: string;
  timeframe: string;
  direction: 'long' | 'short';
  source?: string;
  meta?: TrendAlertMeta;
}
