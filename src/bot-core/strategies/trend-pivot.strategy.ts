import { Strategy } from '../interfaces';
import { toBitgetSymbolId } from '../utils';
import { PositionsStore } from '../positions.store';
import { Logger } from '@nestjs/common';

// Интерфейс для трендового состояния
interface TrendState {
  symbol: string;
  botName: string;
  timeframe: string; // '15m' или '1h'
  longTrendCount: number;
  shortTrendCount: number;
  longPivotCount: number;
  shortPivotCount: number;
  strongLongPivotCount: number;
  strongShortPivotCount: number;
  lastUpdate: Date;
}

// Интерфейс для 4h тренда
interface FourHourTrend {
  symbol: string;
  longTrendCount: number;
  shortTrendCount: number;
  longPivotCount: number;
  shortPivotCount: number;
  strongLongPivotCount: number;
  strongShortPivotCount: number;
  lastUpdate: Date;
}

export class TrendPivotStrategy implements Strategy {
  private readonly logger = new Logger(TrendPivotStrategy.name);

  // In-memory хранилище состояния трендов для 15m и 1h
  private trendStates = new Map<string, TrendState>();

  // In-memory хранилище 4h трендов
  private fourHourTrends = new Map<string, FourHourTrend>();

  constructor(private readonly store: PositionsStore) {}

  // Генерируем ключ для состояния тренда
  private getTrendStateKey(
    botName: string,
    symbol: string,
    timeframe: string,
  ): string {
    return `${botName}:${symbol}:${timeframe}`;
  }

  // Генерируем ключ для 4h тренда
  private getFourHourKey(symbol: string): string {
    return `${symbol}:4h`;
  }

  // Получаем или создаем состояние тренда
  private getOrCreateTrendState(
    botName: string,
    symbol: string,
    timeframe: string,
  ): TrendState {
    const key = this.getTrendStateKey(botName, symbol, timeframe);
    let state = this.trendStates.get(key);

    if (!state) {
      state = {
        symbol,
        botName,
        timeframe,
        longTrendCount: 0,
        shortTrendCount: 0,
        longPivotCount: 0,
        shortPivotCount: 0,
        strongLongPivotCount: 0,
        strongShortPivotCount: 0,
        lastUpdate: new Date(),
      };
      this.trendStates.set(key, state);
    }

    return state;
  }

  // Получаем или создаем 4h тренд
  private getOrCreateFourHourTrend(symbol: string): FourHourTrend {
    const key = this.getFourHourKey(symbol);
    let trend = this.fourHourTrends.get(key);

    if (!trend) {
      trend = {
        symbol,
        longTrendCount: 0,
        shortTrendCount: 0,
        longPivotCount: 0,
        shortPivotCount: 0,
        strongLongPivotCount: 0,
        strongShortPivotCount: 0,
        lastUpdate: new Date(),
      };
      this.fourHourTrends.set(key, trend);
    }

    return trend;
  }

  // Определяем общее направление тренда
  private getTrendDirection(counts: {
    long: number;
    short: number;
  }): 'long' | 'short' | 'neutral' {
    if (counts.long > counts.short) return 'long';
    if (counts.short > counts.long) return 'short';
    return 'neutral';
  }

  // Рассчитываем общие счетчики для тренда
  private calculateTotalTrendCounts(state: TrendState) {
    const longTotal =
      state.longTrendCount + state.longPivotCount + state.strongLongPivotCount;
    const shortTotal =
      state.shortTrendCount +
      state.shortPivotCount +
      state.strongShortPivotCount;
    return { long: longTotal, short: shortTotal };
  }

  // Рассчитываем общие счетчики для 4h
  private calculateFourHourTrendCounts(trend: FourHourTrend) {
    const longTotal =
      trend.longTrendCount + trend.longPivotCount + trend.strongLongPivotCount;
    const shortTotal =
      trend.shortTrendCount +
      trend.shortPivotCount +
      trend.strongShortPivotCount;
    return { long: longTotal, short: shortTotal };
  }

  // Проверяем, можно ли войти в позицию
  private async canEnterPosition(
    bot: any,
    symbol: string,
    timeframe: string,
  ): Promise<boolean> {
    const state = this.getOrCreateTrendState(bot.name, symbol, timeframe);
    const fourHourTrend = this.getOrCreateFourHourTrend(symbol);

    const timeframeDirection = this.getTrendDirection(
      this.calculateTotalTrendCounts(state),
    );
    const fourHourDirection = this.getTrendDirection(
      this.calculateFourHourTrendCounts(fourHourTrend),
    );

    // Входим только если направления совпадают
    return (
      timeframeDirection === fourHourDirection &&
      timeframeDirection !== 'neutral'
    );
  }

  // Проверяем, нужно ли выйти из позиции
  private async shouldExitPosition(
    bot: any,
    symbol: string,
    timeframe: string,
  ): Promise<boolean> {
    const state = this.getOrCreateTrendState(bot.name, symbol, timeframe);
    const fourHourTrend = this.getOrCreateFourHourTrend(symbol);

    const timeframeDirection = this.getTrendDirection(
      this.calculateTotalTrendCounts(state),
    );
    const fourHourDirection = this.getTrendDirection(
      this.calculateFourHourTrendCounts(fourHourTrend),
    );

    // Выходим если направления не совпадают
    return timeframeDirection !== fourHourDirection;
  }

  // Обработка long trend алерта
  async onLongTrend(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `📈 Long Trend для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    if (timeframe === '4h') {
      // 4h алерт - обновляем 4h тренд
      const trend = this.getOrCreateFourHourTrend(alert.symbol);

      // Сбрасываем short счетчики и увеличиваем long
      trend.shortTrendCount = 0;
      trend.shortPivotCount = 0;
      trend.strongShortPivotCount = 0;
      trend.longTrendCount++;
      trend.lastUpdate = new Date();

      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      // 15m/1h алерт - обновляем тренд таймфрейма
      const state = this.getOrCreateTrendState(
        bot.name,
        alert.symbol,
        timeframe,
      );

      // Сбрасываем short счетчики и увеличиваем long
      state.shortTrendCount = 0;
      state.shortPivotCount = 0;
      state.strongShortPivotCount = 0;
      state.longTrendCount++;
      state.lastUpdate = new Date();

      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка short trend алерта
  async onShortTrend(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `📉 Short Trend для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    if (timeframe === '4h') {
      // 4h алерт - обновляем 4h тренд
      const trend = this.getOrCreateFourHourTrend(alert.symbol);

      // Сбрасываем long счетчики и увеличиваем short
      trend.longTrendCount = 0;
      trend.longPivotCount = 0;
      trend.strongLongPivotCount = 0;
      trend.shortTrendCount++;
      trend.lastUpdate = new Date();

      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      // 15m/1h алерт - обновляем тренд таймфрейма
      const state = this.getOrCreateTrendState(
        bot.name,
        alert.symbol,
        timeframe,
      );

      // Сбрасываем long счетчики и увеличиваем short
      state.longTrendCount = 0;
      state.longPivotCount = 0;
      state.strongLongPivotCount = 0;
      state.shortTrendCount++;
      state.lastUpdate = new Date();

      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка long pivot point алерта
  async onLongPivotPoint(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `📊 Long Pivot Point для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    if (timeframe === '4h') {
      // 4h алерт - обновляем 4h тренд
      const trend = this.getOrCreateFourHourTrend(alert.symbol);

      // Сбрасываем short счетчики и увеличиваем long
      trend.shortTrendCount = 0;
      trend.shortPivotCount = 0;
      trend.strongShortPivotCount = 0;
      trend.longPivotCount++;
      trend.lastUpdate = new Date();

      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      // 15m/1h алерт - обновляем тренд таймфрейма
      const state = this.getOrCreateTrendState(
        bot.name,
        alert.symbol,
        timeframe,
      );

      // Сбрасываем short счетчики и увеличиваем long
      state.shortTrendCount = 0;
      state.shortPivotCount = 0;
      state.strongShortPivotCount = 0;
      state.longPivotCount++;
      state.lastUpdate = new Date();

      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка short pivot point алерта
  async onShortPivotPoint(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `📊 Short Pivot Point для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    if (timeframe === '4h') {
      // 4h алерт - обновляем 4h тренд
      const trend = this.getOrCreateFourHourTrend(alert.symbol);

      // Сбрасываем long счетчики и увеличиваем short
      trend.longPivotCount = 0;
      trend.longTrendCount = 0;
      trend.strongLongPivotCount = 0;
      trend.shortPivotCount++;
      trend.lastUpdate = new Date();

      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      // 15m/1h алерт - обновляем тренд таймфрейма
      const state = this.getOrCreateTrendState(
        bot.name,
        alert.symbol,
        timeframe,
      );

      // Сбрасываем long счетчики и увеличиваем short
      state.longTrendCount = 0;
      state.longPivotCount = 0;
      state.strongLongPivotCount = 0;
      state.shortPivotCount++;
      state.lastUpdate = new Date();

      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка strong long pivot point алерта
  async onStrongLongPivotPoint(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `🚀 Strong Long Pivot Point для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    if (timeframe === '4h') {
      // 4h алерт - обновляем 4h тренд
      const trend = this.getOrCreateFourHourTrend(alert.symbol);

      // Сбрасываем short счетчики и увеличиваем strong long
      trend.shortTrendCount = 0;
      trend.shortPivotCount = 0;
      trend.strongShortPivotCount = 0;
      trend.strongLongPivotCount++;
      trend.lastUpdate = new Date();

      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      // 15m/1h алерт - обновляем тренд таймфрейма
      const state = this.getOrCreateTrendState(
        bot.name,
        alert.symbol,
        timeframe,
      );

      // Сбрасываем short счетчики и увеличиваем strong long
      state.shortTrendCount = 0;
      state.shortPivotCount = 0;
      state.strongShortPivotCount = 0;
      state.strongLongPivotCount++;
      state.lastUpdate = new Date();

      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка strong short pivot point алерта
  async onStrongShortPivotPoint(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `🚀 Strong Short Pivot Point для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    if (timeframe === '4h') {
      // 4h алерт - обновляем 4h тренд
      const trend = this.getOrCreateFourHourTrend(alert.symbol);

      // Сбрасываем long счетчики и увеличиваем strong short
      trend.longTrendCount = 0;
      trend.longPivotCount = 0;
      trend.strongLongPivotCount = 0;
      trend.strongShortPivotCount++;
      trend.lastUpdate = new Date();

      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      // 15m/1h алерт - обновляем тренд таймфрейма
      const state = this.getOrCreateTrendState(
        bot.name,
        alert.symbol,
        timeframe,
      );

      // Сбрасываем long счетчики и увеличиваем strong short
      state.longTrendCount = 0;
      state.longPivotCount = 0;
      state.strongLongPivotCount = 0;
      state.strongShortPivotCount++;
      state.lastUpdate = new Date();

      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка изменения тренда для 15m/1h
  private async processTrendChange(
    bot: any,
    symbol: string,
    timeframe: string,
  ): Promise<void> {
    const existing = await this.store.findOpen(bot.name, symbol);

    if (existing) {
      // Проверяем, нужно ли выйти из позиции
      if (await this.shouldExitPosition(bot, symbol, timeframe)) {
        this.logger.log(
          `🔄 Тренд изменился для ${symbol} на ${timeframe} - выходим из позиции`,
        );
        await this.exitPosition(bot, symbol, existing);
      }
    } else {
      // Проверяем, можно ли войти в позицию
      if (await this.canEnterPosition(bot, symbol, timeframe)) {
        this.logger.log(
          `✅ Направления совпадают для ${symbol} на ${timeframe} - входим в позицию`,
        );
        await this.enterPosition(bot, symbol, timeframe);
      }
    }
  }

  // Обработка изменения 4h тренда
  private async processFourHourTrendChange(
    bot: any,
    symbol: string,
  ): Promise<void> {
    // Проверяем все таймфреймы бота
    const timeframes = ['15m', '1h'];

    for (const timeframe of timeframes) {
      const state = this.trendStates.get(
        this.getTrendStateKey(bot.name, symbol, timeframe),
      );
      if (state) {
        await this.processTrendChange(bot, symbol, timeframe);
      }
    }
  }

  // Вход в позицию
  private async enterPosition(
    bot: any,
    symbol: string,
    timeframe: string,
  ): Promise<void> {
    const existing = await this.store.findOpen(bot.name, symbol);
    if (existing) {
      this.logger.log(`⚠️ Позиция ${symbol} уже открыта для ${bot.name}`);
      return;
    }

    const symbolId = toBitgetSymbolId(symbol);
    const price = '0'; // Цена будет получена при исполнении

    try {
      // Устанавливаем плечо
      if (bot.cfg.smartvol?.leverage) {
        await bot.exchange.ensureLeverage?.(
          symbolId,
          String(bot.cfg.smartvol.leverage),
        );
      }

      // Получаем размер позиции из конфигурации
      const baseUsd = bot.cfg.smartvol?.baseUsd || 200;

      // Рассчитываем размер позиции
      const size = await bot.exchange.calcSizeFromUsd?.(
        symbolId,
        0, // Цена будет получена при исполнении
        baseUsd,
      );

      // Размещаем рыночный ордер
      await bot.exchange.placeMarket?.(
        symbolId,
        'buy',
        String(size),
        `${bot.name}-trend-${Date.now()}`,
      );

      // Создаем позицию в БД
      const position = await this.store.open(
        bot.name,
        symbol,
        price,
        String(baseUsd),
      );

      await bot.notify(
        `✅ ${bot.name}: TREND ENTRY ${symbol} на ${timeframe}\n` +
          `💰 Размер: $${baseUsd}\n` +
          `📊 Направление: ${this.getTrendDirection(this.calculateTotalTrendCounts(this.getOrCreateTrendState(bot.name, symbol, timeframe)))}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при входе в позицию ${symbol}: ${error.message}`,
      );
      await bot.notify(
        `❌ ${bot.name}: Ошибка входа в позицию ${symbol}: ${error.message}`,
      );
    }
  }

  // Выход из позиции
  private async exitPosition(
    bot: any,
    symbol: string,
    position: any,
  ): Promise<void> {
    try {
      // Закрываем позицию на бирже
      await bot.exchange.flashClose?.(symbol, 'long');

      // Закрываем позицию в БД
      await this.store.close(position, '0');

      await bot.notify(
        `🛑 ${bot.name}: TREND EXIT ${symbol}\n` +
          `📊 Тренд изменился - позиция закрыта`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при выходе из позиции ${symbol}: ${error.message}`,
      );
      await bot.notify(
        `❌ ${bot.name}: Ошибка выхода из позиции ${symbol}: ${error.message}`,
      );
    }
  }

  // Методы интерфейса Strategy (не используются)
  async onOpen(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onAdd(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onClose(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onBigClose(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onBigAdd(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onSmartVolumeOpen(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onBullishVolume(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onVolumeUp(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  // Методы для ThreeAlerts стратегии (не используются в TrendPivot)
  async onBullRelsi(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onBearRelsi(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onBullMarubozu(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onBearMarubozu(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onIstinoeBullPogloshenie(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onIstinoeBearPogloshenie(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }
}
