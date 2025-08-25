import {
  Alert,
  BotConfig,
  ExchangeGateway,
  Notifier,
  Strategy,
  TrendProvider,
  SmartOpenAlert,
  SmartVolAddAlert,
  SmartCloseAlert,
  SmartBigCloseAlert,
  SmartBigAddAlert,
  SmartVolumeOpenAlert,
  BullishVolumeAlert,
  VolumeUpAlert,
  FixedShortSynchronizationAlert,
  LiveShortSynchronizationAlert,
} from './interfaces';
import { Logger } from '@nestjs/common';

export class BotEngine {
  private readonly logger = new Logger(BotEngine.name);

  constructor(
    public readonly cfg: BotConfig,
    public readonly exchange: ExchangeGateway,
    private readonly notifier: Notifier,
    private readonly trend: TrendProvider,
    public readonly strategy: Strategy,
  ) {}
  get name() {
    return this.cfg.name;
  }
  async notify(text: string) {
    await this.notifier.send(text);
  }
  baseUsd() {
    const baseUsd = this.cfg.smartvol?.baseUsd;
    if (!baseUsd || isNaN(baseUsd)) {
      this.logger.error(
        `❌ Ошибка конфигурации: baseUsd не определен или не является числом: ${baseUsd}`,
      );
      return undefined;
    }
    return baseUsd;
  }
  addUsd() {
    const baseUsd = this.baseUsd();
    if (!baseUsd) return undefined;

    const addFraction = this.cfg.smartvol?.addFraction;
    if (!addFraction || isNaN(addFraction)) {
      this.logger.error(
        `❌ Ошибка конфигурации: addFraction не определен или не является числом: ${addFraction}`,
      );
      return undefined;
    }

    return Math.round(baseUsd * addFraction);
  }
  mustCheckTrend() {
    return this.cfg.is_trended && this.cfg.timeframe_trend.length > 0;
  }
  async trendAgrees(symbol: string) {
    return this.trend.agreeAll(symbol, this.cfg.timeframe_trend);
  }

  /**
   * Проверяет тренд с учетом иерархии таймфреймов
   * Главный таймфрейм имеет приоритет над остальными
   */
  async trendAgreesWithHierarchy(symbol: string) {
    return this.trend.agreeAllWithHierarchy(symbol, this.cfg.timeframe_trend);
  }

  /**
   * Проверяет, можно ли докупать позицию
   * Для докупки все таймфреймы должны совпадать
   */
  async canAddPosition(symbol: string) {
    return this.trend.canAddPosition(
      symbol,
      this.cfg.timeframe_trend,
      this.cfg.direction,
    );
  }

  /**
   * Проверяет, нужно ли закрывать позицию
   * Закрываем только если главный тренд развернулся
   */
  async shouldClosePosition(symbol: string) {
    return this.trend.shouldClosePosition(
      symbol,
      this.cfg.timeframe_trend,
      this.cfg.direction,
    );
  }

  /**
   * Получает главный (высший по приоритету) таймфрейм
   */
  getMainTimeframe() {
    if (!this.cfg.timeframe_trend || this.cfg.timeframe_trend.length === 0)
      return null;

    const sorted = [...this.cfg.timeframe_trend].sort((a, b) => {
      const priorityA = this.getTimeframePriority(a);
      const priorityB = this.getTimeframePriority(b);
      return priorityB - priorityA;
    });

    return sorted[0];
  }

  /**
   * Вспомогательный метод для определения приоритета таймфрейма
   */
  private getTimeframePriority(timeframe: string): number {
    const match = /^(\d+)([mhdw])$/i.exec(timeframe);
    if (!match) return 0;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
      m: 1, // минуты
      h: 60, // часы (60 минут)
      d: 1440, // дни (24 * 60 минут)
      w: 10080, // недели (7 * 24 * 60 минут)
    };

    return value * multipliers[unit];
  }
  async process(alert: Alert) {
    this.logger.log(
      `🔄 Бот ${this.name} обрабатывает алерт: ${(alert as any).type} для ${alert.symbol} @${alert.price}`,
    );

    if ((alert as any).type === 'SmartOpen') {
      this.logger.log(`📈 Открываю позицию для ${alert.symbol}`);
      return this.strategy.onOpen(this, alert as SmartOpenAlert);
    }
    if ((alert as any).type === 'SmartVolumeOpen') {
      this.logger.log(`📊 Открываю позицию по SmartVolume для ${alert.symbol}`);
      return this.strategy.onSmartVolumeOpen(
        this,
        alert as SmartVolumeOpenAlert,
      );
    }
    if ((alert as any).type === 'SmartVolAdd') {
      this.logger.log(`➕ Докупаю позицию для ${alert.symbol}`);
      return this.strategy.onAdd(this, alert as SmartVolAddAlert);
    }
    if ((alert as any).type === 'SmartClose') {
      this.logger.log(`🛑 Закрываю позицию для ${alert.symbol}`);
      return this.strategy.onClose(this, alert as SmartCloseAlert);
    }
    if ((alert as any).type === 'SmartBigClose') {
      this.logger.log(`🚨 Экстренное закрытие позиции для ${alert.symbol}`);
      return this.strategy.onBigClose(this, alert as SmartBigCloseAlert);
    }
    if ((alert as any).type === 'SmartBigAdd') {
      this.logger.log(`🚀 Большая докупка для ${alert.symbol}`);
      return this.strategy.onBigAdd(this, alert as SmartBigAddAlert);
    }
    if ((alert as any).type === 'BullishVolume') {
      this.logger.log(`🐂 Bullish Volume для ${alert.symbol}`);
      return this.strategy.onBullishVolume(this, alert as BullishVolumeAlert);
    }
    if ((alert as any).type === 'VolumeUp') {
      this.logger.log(`📊 Volume Up для ${alert.symbol}`);
      return this.strategy.onVolumeUp(this, alert as VolumeUpAlert);
    }
    if ((alert as any).type === 'FixedShortSynchronization') {
      this.logger.log(`🔒 Fixed Short Synchronization для ${alert.symbol}`);
      return this.strategy.onFixedShortSynchronization(
        this,
        alert as FixedShortSynchronizationAlert,
      );
    }
    if ((alert as any).type === 'LiveShortSynchronization') {
      this.logger.log(`🔒 Live Short Synchronization для ${alert.symbol}`);
      return this.strategy.onLiveShortSynchronization(
        this,
        alert as LiveShortSynchronizationAlert,
      );
    }

    this.logger.warn(`⚠️ Неизвестный тип алерта: ${(alert as any).type}`);
  }
}
