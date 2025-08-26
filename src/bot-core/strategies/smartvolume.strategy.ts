import { Strategy } from '../interfaces';
import { toBitgetSymbolId } from '../utils';
import { PositionsStore } from '../positions.store';
import { VolumeUpService } from '../../services/volume-up.service';
import { Logger } from '@nestjs/common';

// In-memory состояние для отслеживания SmartVolume
interface SmartVolumeState {
  symbol: string;
  botName: string;
  isReadyToClose: boolean;
  lastBullishVolume: number;
  lastSmartVolume: number;
  lastUpdate: number;
}

export class SmartVolumeStrategy implements Strategy {
  private readonly logger = new Logger(SmartVolumeStrategy.name);

  // In-memory хранилище состояния SmartVolume
  private smartVolumeStates = new Map<string, SmartVolumeState>();

  constructor(
    private readonly store: PositionsStore,
    private readonly volumeUpService: VolumeUpService,
  ) {}

  // Генерируем ключ для состояния
  private getStateKey(botName: string, symbol: string): string {
    return `${botName}:${symbol}`;
  }

  // Получаем или создаем состояние
  private getOrCreateState(botName: string, symbol: string): SmartVolumeState {
    const key = this.getStateKey(botName, symbol);
    let state = this.smartVolumeStates.get(key);

    if (!state) {
      state = {
        symbol,
        botName,
        isReadyToClose: false,
        lastBullishVolume: 0,
        lastSmartVolume: 0,
        lastUpdate: Date.now(),
      };
      this.smartVolumeStates.set(key, state);
    }

    return state;
  }

  // Очищаем состояние при закрытии позиции
  private clearState(botName: string, symbol: string): void {
    const key = this.getStateKey(botName, symbol);
    this.smartVolumeStates.delete(key);
  }

  // Проверяем таймаут Bullish Volume (30 минут)
  private isBullishVolumeActive(lastUpdate: number): boolean {
    const now = Date.now();
    const timeoutMs = 30 * 60 * 1000; // 30 минут
    return now - lastUpdate <= timeoutMs;
  }

  async onOpen(bot, alert) {
    this.logger.log(
      `🚀 Стратегия SmartVolume onOpen для ${alert.symbol} @${alert.price}`,
    );

    // Проверяем таймфрейм - открываем ТОЛЬКО при 30m
    const timeframe = alert.timeframe || '30m';
    if (timeframe !== '30m') {
      this.logger.log(
        `⏸ SmartVolumeOpen с таймфреймом ${timeframe} - пропускаю (нужен 30m)`,
      );
      // Молча пропускаем - не отправляем уведомления
      return;
    }

    this.logger.log(`🔍 Проверяю существующую позицию для ${alert.symbol}`);
    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (existing) {
      this.logger.log(
        `📊 Найдена существующая позиция: ${existing.fillsCount}/${bot.cfg.maxFills ?? 3} заполнений`,
      );
      if (existing.fillsCount >= (bot.cfg.maxFills ?? 3)) {
        this.logger.log(`⚠️ Достигнут максимум заполнений`);
        await bot.notify(
          `⚠️ ${bot.name}: max fills reached for ${alert.symbol}`,
        );
        return;
      }
      this.logger.log(`➕ Переходим к докупке`);
      return this.onAdd(bot, alert);
    }
    this.logger.log(`🆕 Позиция не найдена, открываю новую`);

    const symbolId = toBitgetSymbolId(alert.symbol);
    this.logger.log(`🔧 Символ для биржи: ${symbolId}`);

    if (bot.exchange.isAllowed && !bot.exchange.isAllowed(symbolId)) {
      this.logger.log(`❌ Символ ${symbolId} не разрешен`);
      await bot.notify(`⚠️ ${bot.name}: ${symbolId} not allowed`);
      return;
    }
    this.logger.log(`✅ Символ ${symbolId} разрешен`);
    this.logger.log(`⚙️ Устанавливаю плечо: ${bot.cfg.smartvol.leverage}`);
    await bot.exchange.ensureLeverage?.(
      symbolId,
      String(bot.cfg.smartvol.leverage),
    );

    this.logger.log(`💰 Рассчитываю размер позиции для $${bot.baseUsd()}`);
    const size = await bot.exchange.calcSizeFromUsd?.(
      symbolId,
      Number(alert.price),
      bot.baseUsd(),
    );
    this.logger.log(`📊 Размер позиции: ${size}`);

    this.logger.log(`📈 Размещаю рыночный ордер`);
    await bot.exchange.placeMarket?.(
      symbolId,
      'buy',
      String(size),
      `${bot.name}-open-${Date.now()}`,
    );
    const baseUsd = bot.baseUsd();
    if (!baseUsd || isNaN(baseUsd)) {
      this.logger.error(
        `❌ Ошибка: baseUsd не определен или не является числом: ${baseUsd}`,
      );
      await bot.notify(
        `❌ ${bot.name}: Ошибка конфигурации - baseUsd не определен`,
      );
      return;
    }

    this.logger.log(
      `💾 Создаю позицию в БД: ${bot.name}, ${alert.symbol}, ${alert.price}, $${baseUsd}`,
    );
    const position = await this.store.open(
      bot.name,
      alert.symbol,
      alert.price,
      String(baseUsd),
    );
    this.logger.log(`✅ Позиция создана в БД с ID: ${position.id}`);

    // Инициализируем состояние SmartVolume
    this.getOrCreateState(bot.name, alert.symbol);

    const positionInfo = this.store.getPositionInfo(
      position,
      Number(alert.price),
    );

    await bot.notify(
      `✅ ${bot.name}: SMART VOLUME OPEN ${alert.symbol} @${alert.price} $${baseUsd}\n` +
        `📊 Размер: ${positionInfo.pnl?.totalSize || '0'} ${alert.symbol.replace('USDT', '')}\n` +
        `💰 Средняя цена: $${positionInfo.pnl?.avgEntryPrice || alert.price}\n` +
        `📈 Текущая цена: $${positionInfo.pnl?.currentPrice || alert.price}\n` +
        `💵 PnL: $${positionInfo.pnl?.pnl || '0'} (${positionInfo.pnl?.pnlPercent || '0'}%)`,
    );
  }

  async onAdd(bot, alert) {
    this.logger.log(
      `➕ Стратегия SmartVolume onAdd для ${alert.symbol} @${alert.price}`,
    );

    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (!existing) {
      this.logger.log(
        `⚠️ Позиция ${alert.symbol} не найдена в БД для бота ${bot.name}, пропускаю докупку`,
      );
      return;
    }

    if (existing.fillsCount >= (bot.cfg.maxFills ?? 3)) {
      await bot.notify(`⚠️ ${bot.name}: max fills reached for ${alert.symbol}`);
      return;
    }

    const addUsd = bot.addUsd();
    if (!addUsd || isNaN(addUsd)) {
      this.logger.error(
        `❌ Ошибка: addUsd не определен или не является числом: ${addUsd}`,
      );
      await bot.notify(
        `❌ ${bot.name}: Ошибка конфигурации - addUsd не определен`,
      );
      return;
    }

    const symbolId = toBitgetSymbolId(alert.symbol);
    const size = await bot.exchange.calcSizeFromUsd?.(
      symbolId,
      Number(alert.price),
      addUsd,
    );
    await bot.exchange.placeMarket?.(
      symbolId,
      'buy',
      String(size),
      `${bot.name}-add-${Date.now()}`,
    );
    await this.store.add(existing, alert.price, String(addUsd));

    const updatedPosition = await this.store.findOpen(bot.name, alert.symbol);
    if (updatedPosition) {
      const positionInfo = this.store.getPositionInfo(
        updatedPosition,
        Number(alert.price),
      );

      await bot.notify(
        `➕ ${bot.name}: SMART VOLUME ADD ${alert.symbol} @${alert.price} $${addUsd}\n` +
          `📊 Новый размер: ${positionInfo.pnl?.totalSize || '0'} ${alert.symbol.replace('USDT', '')}\n` +
          `💰 Новая средняя цена: $${positionInfo.pnl?.avgEntryPrice || alert.price}\n` +
          `📈 Текущая цена: ${positionInfo.pnl?.currentPrice || alert.price}\n` +
          `💵 PnL: $${positionInfo.pnl?.pnl || '0'} (${positionInfo.pnl?.pnlPercent || '0'}%)`,
      );
    } else {
      await bot.notify(
        `➕ ${bot.name}: SMART VOLUME ADD ${alert.symbol} @${alert.price} $${addUsd}`,
      );
    }
  }

  async onClose(bot, alert) {
    this.logger.log(
      `🔄 SmartVolume onClose для ${alert.symbol} - не используется в этой стратегии`,
    );

    // В этой стратегии onClose не используется
    // Закрытие происходит через SmartVolume и Bullish Volume
    // Молча пропускаем - не отправляем уведомления
  }

  async onBigClose(bot, alert) {
    this.logger.log(
      `🚨 SmartBigClose для ${alert.symbol} - экстренное закрытие всей позиции`,
    );

    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (!existing) {
      this.logger.log(
        `⚠️ Позиция ${alert.symbol} не найдена в БД для бота ${bot.name}, пропускаю закрытие`,
      );
      return;
    }

    try {
      await bot.exchange.flashClose?.(alert.symbol, 'long');
      const finalPnL = this.store.calculatePnL(existing, Number(alert.price));
      await this.store.close(existing, alert.price);

      // Очищаем состояние SmartVolume
      this.clearState(bot.name, alert.symbol);

      await bot.notify(
        `🚨 ${bot.name}: SMART VOLUME BIG CLOSE ${alert.symbol} @${alert.price}\n` +
          `📊 Финальный размер: ${finalPnL.totalSize} ${alert.symbol.replace('USDT', '')}\n` +
          `💰 Средняя цена входа: $${finalPnL.avgEntryPrice}\n` +
          `📈 Цена закрытия: $${finalPnL.currentPrice}\n` +
          `💵 Финальный PnL: $${finalPnL.pnl} (${finalPnL.pnlPercent}%)`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при экстренном закрытии позиции ${alert.symbol}: ${error.message}`,
      );
      throw error;
    }
  }

  async onBigAdd(bot, alert) {
    this.logger.log(`🚀 SmartBigAdd для ${alert.symbol} - большая докупка`);

    // Логика для SmartBigAdd (можно реализовать по необходимости)
    await bot.notify(
      `🚀 ${bot.name}: SMART VOLUME BIG ADD сигнал для ${alert.symbol} @${alert.price}`,
    );
  }

  async onVolumeUp(bot, alert) {
    this.logger.log(
      `📊 SmartVolume для ${alert.symbol} (${alert.timeframe}) с объемом ${alert.volume}`,
    );

    // Проверяем, есть ли открытая позиция
    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (!existing) {
      this.logger.log(
        `📊 Позиция ${alert.symbol} не открыта, пропускаю SmartVolume`,
      );
      return;
    }

    // Получаем состояние
    const state = this.getOrCreateState(bot.name, alert.symbol);

    this.logger.log(
      `🔍 Состояние для ${alert.symbol}: isReadyToClose=${state.isReadyToClose}, lastUpdate=${new Date(state.lastUpdate).toISOString()}`,
    );

    // Проверяем, активен ли Bullish Volume (30 минут)
    const isActive = this.isBullishVolumeActive(state.lastUpdate);
    this.logger.log(
      `⏰ Bullish Volume активен: ${isActive} (прошло ${Math.round((Date.now() - state.lastUpdate) / 1000)} секунд)`,
    );

    if (!state.isReadyToClose || !isActive) {
      this.logger.log(
        `📊 Bullish Volume не активен для ${alert.symbol}, пропускаю SmartVolume`,
      );
      return;
    }

    // Сохраняем предыдущее значение объема для сравнения
    const previousVolume = state.lastSmartVolume;

    this.logger.log(
      `📊 Сравниваю объемы: текущий=${alert.volume}, предыдущий=${previousVolume}`,
    );

    // Сравниваем с предыдущим значением
    if (previousVolume > 0 && alert.volume < previousVolume) {
      this.logger.log(
        `📉 Объем уменьшился с ${previousVolume} до ${alert.volume} для ${alert.symbol} - закрываю позицию`,
      );

      try {
        await bot.exchange.flashClose?.(alert.symbol, 'long');
        const finalPnL = this.store.calculatePnL(existing, Number(alert.price));
        await this.store.close(existing, alert.price);

        // Очищаем состояние SmartVolume
        this.clearState(bot.name, alert.symbol);

        await bot.notify(
          `📉 ${bot.name}: SMART VOLUME CLOSE ${alert.symbol} @${alert.price}\n` +
            `📊 Объем уменьшился: ${previousVolume} → ${alert.volume}\n` +
            `📊 Финальный размер: ${finalPnL.totalSize} ${alert.symbol.replace('USDT', '')}\n` +
            `💰 Средняя цена входа: $${finalPnL.avgEntryPrice}\n` +
            `📈 Цена закрытия: $${finalPnL.currentPrice}\n` +
            `💵 Финальный PnL: $${finalPnL.pnl} (${finalPnL.pnlPercent}%)`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Ошибка при закрытии позиции ${alert.symbol}: ${error.message}`,
        );
        throw error;
      }
    } else {
      this.logger.log(
        `📊 Объем НЕ уменьшился: ${alert.volume} >= ${previousVolume}`,
      );

      // Обновляем последнее значение объема
      state.lastSmartVolume = alert.volume;
      state.lastUpdate = Date.now();

      this.logger.log(
        `📊 Обновлено состояние: lastSmartVolume=${state.lastSmartVolume}, lastUpdate=${new Date(state.lastUpdate).toISOString()}`,
      );
    }
  }

  // Новый метод для обработки Bullish Volume
  async onBullishVolume(bot, alert) {
    this.logger.log(
      `🐂 Bullish Volume для ${alert.symbol} - активирую готовность к закрытию`,
    );

    // Проверяем, есть ли открытая позиция
    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (!existing) {
      this.logger.log(
        `🐂 Позиция ${alert.symbol} не открыта, пропускаю Bullish Volume`,
      );
      return;
    }

    // Получаем состояние
    const state = this.getOrCreateState(bot.name, alert.symbol);

    // Активируем готовность к закрытию
    state.isReadyToClose = true;
    state.lastBullishVolume = Date.now();
    state.lastUpdate = Date.now();

    this.logger.log(
      `🐂 Активирована готовность к закрытию для ${alert.symbol} - ожидаю уменьшения объема`,
    );

    await bot.notify(
      `🐂 ${bot.name}: Bullish Volume активирован для ${alert.symbol} - готов к закрытию при уменьшении объема`,
    );
  }

  // Метод для SmartVolumeOpen (аналогичен onOpen)
  async onSmartVolumeOpen(bot, alert) {
    return this.onOpen(bot, alert);
  }

  // Методы для TrendPivot стратегии (не используются в SmartVolume)
  async onLongTrend(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onShortTrend(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onLongPivotPoint(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onShortPivotPoint(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onStrongLongPivotPoint(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onStrongShortPivotPoint(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  // Методы для ThreeAlerts стратегии (не используются в SmartVolume)
  async onBullRelsi(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onBearRelsi(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onBullMarubozu(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onBearMarubozu(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onIstinoeBullPogloshenie(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }

  async onIstinoeBearPogloshenie(bot: any, alert: any): Promise<void> {
    // Не используется в SmartVolume стратегии
  }
}
