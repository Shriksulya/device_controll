import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitgetV1Client } from './bitget.client';
import { toBitgetSymbolId, toBitgetV2Symbol } from '../../bot-core/utils';

type HoldSide = 'long' | 'short';

interface ContractInfo {
  symbol: string;
  volumePlace: number;
  pricePlace: number;
  sizeMultiplier: number;
  minTradeNum: number;
  maxMarketOrderQty: number;
  fetchedAt: number;
}

@Injectable()
export class BitgetService {
  private readonly logger = new Logger(BitgetService.name);
  private client: BitgetV1Client;

  private productType!: string;
  private marginCoin!: string;
  private positionMode!: 'single' | 'double';
  private cacheTTL!: number;

  private contracts = new Map<string, ContractInfo>();
  private allowed = new Set<string>([
    'ETHUSDT_UMCBL',
    'LINKUSDT_UMCBL',
    'ARBUSDT_UMCBL',
  ]);

  private leverageCache = new Set<string>();

  constructor(
    private readonly cfg: ConfigService,
    @Optional() private readonly profile?: 'BITGET' | 'BITGET2',
  ) {
    const p = this.profile ?? 'BITGET';

    // --- НОВОЕ: поддержка вложенного конфига ---
    const nested = this.cfg.get<{
      baseURL: string;
      key: string;
      secret: string;
      passphrase: string;
      productType?: string;
      marginCoin?: string;
      allowedCsv?: string;
      positionMode?: 'single' | 'double';
      contractTtlSec?: string;
    }>(`bitget.${p}`);

    const baseURL =
      nested?.baseURL ??
      this.cfg.get<string>(`${p}_BASE_URL`, 'https://api.bitget.com');
    const key = nested?.key ?? this.cfg.get<string>(`${p}_KEY`, '');
    const sec = nested?.secret ?? this.cfg.get<string>(`${p}_SECRET`, '');
    const pass =
      nested?.passphrase ?? this.cfg.get<string>(`${p}_PASSPHRASE`, '');

    this.client = new BitgetV1Client(baseURL, key, sec, pass);

    this.productType = (
      nested?.productType ??
      this.cfg.get<string>(`${p}_PRODUCT_TYPE`, 'umcbl') ??
      'umcbl'
    ).toLowerCase();
    this.marginCoin = (
      nested?.marginCoin ??
      this.cfg.get<string>(`${p}_MARGIN_COIN`, 'USDT') ??
      'USDT'
    ).toUpperCase();
    this.positionMode = (nested?.positionMode ??
      this.cfg.get<string>(`${p}_POSITION_MODE`, 'single') ??
      'single') as 'single' | 'double';

    const ttlSec =
      nested?.contractTtlSec ??
      this.cfg.get<string>(`${p}_CONTRACT_CACHE_TTL`, '600');
    this.cacheTTL = Number(ttlSec) * 1000;

    const allowedCsv =
      nested?.allowedCsv ??
      this.cfg.get<string>(
        `${p}_ALLOWED`,
        'ETHUSDT_UMCBL,LINKUSDT_UMCBL,ARBUSDT_UMCBL',
      );
    this.allowed = new Set(
      (allowedCsv || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  async reduceMarket(
    symbolId: string,
    holdSide: 'long',
    size: string,
    clientOid?: string,
  ) {
    const body: any = {
      symbol: symbolId,
      marginCoin: this.marginCoin,
      size,
      side: 'close_long',
      orderType: 'market',
    };
    if (clientOid) body.clientOid = clientOid;

    const res = await this.client.call<any>({
      method: 'POST',
      requestPath: '/api/mix/v1/order/placeOrder',
      body,
    });
    if (res?.code && res.code !== '00000')
      throw new Error(`reduceMarket failed: code=${res.code} msg=${res.msg}`);
    return res?.data ?? res;
  }

  toSymbolId(sym: string): string {
    return toBitgetSymbolId(sym);
  }
  isAllowed(symId: string) {
    return this.allowed.has(symId);
  }

  private floorToStep(x: number, step: number) {
    return Math.floor(x / step) * step;
  }

  private async loadContract(symbolId: string): Promise<ContractInfo> {
    const now = Date.now();
    const cached = this.contracts.get(symbolId);
    if (cached && now - cached.fetchedAt < this.cacheTTL) return cached;

    const data = await this.client.call<{ code: string; data: any[] }>({
      method: 'GET',
      requestPath: '/api/mix/v1/market/contracts',
      query: { productType: this.productType },
    });

    const row = (data.data || []).find((r: any) => r.symbol === symbolId);
    if (!row) throw new Error(`Contract config not found for ${symbolId}`);

    const info: ContractInfo = {
      symbol: row.symbol,
      volumePlace: Number(row.volumePlace),
      pricePlace: Number(row.pricePlace),
      sizeMultiplier: Number(row.sizeMultiplier),
      minTradeNum: Number(row.minTradeNum),
      maxMarketOrderQty: row.maxMarketOrderQty
        ? Number(row.maxMarketOrderQty)
        : Number.POSITIVE_INFINITY,
      fetchedAt: now,
    };
    this.contracts.set(symbolId, info);
    return info;
  }

  async calcSizeFromUsd(
    symbolId: string,
    lastPrice: number,
    usdAmount: number,
  ): Promise<string> {
    if (usdAmount <= 0) throw new Error('usdAmount must be > 0');
    const cfg = await this.loadContract(symbolId);
    const raw = usdAmount / lastPrice;
    const step =
      cfg.sizeMultiplier > 0
        ? cfg.sizeMultiplier
        : Math.pow(10, -cfg.volumePlace);
    const floored = this.floorToStep(raw, step);
    const minOk = Math.max(floored, cfg.minTradeNum);
    const capped = Math.min(minOk, cfg.maxMarketOrderQty);
    const size = Number(capped.toFixed(cfg.volumePlace));
    if (size < cfg.minTradeNum)
      throw new Error(`Size ${size} < minTradeNum ${cfg.minTradeNum}`);
    return size.toFixed(cfg.volumePlace);
  }

  async ensureLeverage(
    symbolId: string,
    leverage: string,
    holdSide?: HoldSide,
  ) {
    const key = `${symbolId}:${holdSide ?? 'na'}:${leverage}`;
    if (this.leverageCache.has(key)) return;

    const body: any = {
      symbol: symbolId,
      marginCoin: this.marginCoin,
      leverage,
    };
    if (holdSide) body.holdSide = holdSide;

    const res = await this.client.call<any>({
      method: 'POST',
      requestPath: '/api/mix/v1/account/setLeverage',
      body,
    });
    if (res?.code && res.code !== '00000')
      throw new Error(`setLeverage failed: code=${res.code} msg=${res.msg}`);
    this.leverageCache.add(key);
  }

  private isSideMismatch(e: any) {
    const code = e?.data?.code || e?.code;
    const msg = (e?.message || '').toLowerCase();
    return code === '400172' && msg.includes('side mismatch');
  }

  async placeMarket(
    symbolId: string,
    side: 'buy' | 'sell',
    size: string,
    clientOid?: string,
  ) {
    const bodyOneWay: any = {
      symbol: symbolId,
      marginCoin: this.marginCoin,
      size,
      side,
      orderType: 'market',
    };
    if (clientOid) bodyOneWay.clientOid = clientOid;

    try {
      const res = await this.client.call<any>({
        method: 'POST',
        requestPath: '/api/mix/v1/order/placeOrder',
        body: bodyOneWay,
      });
      if (res?.code && res.code !== '00000')
        throw new Error(`placeOrder failed: code=${res.code} msg=${res.msg}`);
      return res?.data ?? res;
    } catch (e: any) {
      if (!this.isSideMismatch(e)) throw e;
      this.logger.warn(
        `one-way order failed with side mismatch, retrying hedge…`,
      );
    }

    const sideHedge = side === 'buy' ? 'open_long' : 'open_short';
    const bodyHedge: any = {
      symbol: symbolId,
      marginCoin: this.marginCoin,
      size,
      side: sideHedge,
      orderType: 'market',
    };
    if (clientOid) bodyHedge.clientOid = clientOid;

    const res2 = await this.client.call<any>({
      method: 'POST',
      requestPath: '/api/mix/v1/order/placeOrder',
      body: bodyHedge,
    });
    if (res2?.code && res2.code !== '00000')
      throw new Error(
        `placeOrder(hedge) failed: code=${res2.code} msg=${res2.msg}`,
      );
    return res2?.data ?? res2;
  }

  private v2ProductType(): 'USDT-FUTURES' | 'COIN-FUTURES' | 'USDC-FUTURES' {
    const p = (this.productType || '').toLowerCase();
    if (p === 'umcbl' || p === 'umcb' || p === 'usdt') return 'USDT-FUTURES';
    if (p === 'dmcbl' || p === 'coin') return 'COIN-FUTURES';
    if (p === 'cmcbl' || p === 'usdc') return 'USDC-FUTURES';
    return 'USDT-FUTURES';
  }

  private isNoPositionErr(e: any) {
    const code = e?.data?.code || e?.code;
    const msg = (e?.message || '').toLowerCase();
    const responseMsg = (e?.response?.data?.msg || '').toLowerCase();

    // Проверяем различные варианты ошибок "позиция не найдена"
    const isNoPosition =
      code === '22002' ||
      msg.includes('no position to close') ||
      msg.includes('position not found') ||
      responseMsg.includes('no position to close') ||
      responseMsg.includes('position not found');

    if (isNoPosition) {
      this.logger.log(
        `ℹ️ Обнаружена ошибка "позиция не найдена": code=${code}, msg=${msg}, responseMsg=${responseMsg}`,
      );
    }

    return isNoPosition;
  }

  async flashClose(symbolInput: string, holdSide?: 'long' | 'short') {
    const symbolId = toBitgetSymbolId(symbolInput);
    if (!this.isAllowed(symbolId)) {
      this.logger.warn(
        `flashClose skipped: symbol not allowed: ${symbolInput} -> ${symbolId}`,
      );
      return { skipped: true, reason: 'symbol-not-allowed', symbolId };
    }

    const symbolV2 = toBitgetV2Symbol(symbolInput);
    const productType = this.v2ProductType();

    const body: any = {
      symbol: symbolV2,
      productType,
      ...(holdSide ? { holdSide } : {}),
    };

    try {
      const res = await this.client.call<{
        code: string;
        msg?: string;
        data?: any;
      }>({
        method: 'POST',
        requestPath: '/api/v2/mix/order/close-positions',
        body,
      });
      if (res?.code && res.code !== '00000')
        throw new Error(
          `close-positions failed: code=${res.code} msg=${res.msg}`,
        );
      return res?.data ?? res;
    } catch (e: any) {
      if (this.isNoPositionErr(e)) {
        this.logger.log(
          `flashClose: позиция ${symbolV2} не найдена на бирже (обрабатываю как успех)`,
        );
        return { ok: true, noop: true, reason: 'no-position-on-exchange' };
      }

      // Логируем детали ошибки для отладки
      this.logger.error(`❌ Ошибка flashClose для ${symbolV2}: ${e.message}`);
      if (e.response?.data) {
        this.logger.error(
          `📊 Детали ответа: ${JSON.stringify(e.response.data)}`,
        );
      }

      throw e;
    }
  }
}
