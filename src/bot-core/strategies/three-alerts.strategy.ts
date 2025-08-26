import { Injectable, Logger } from '@nestjs/common';
import {
  Strategy,
  BullRelsiAlert,
  BearRelsiAlert,
  BullMarubozuAlert,
  BearMarubozuAlert,
  IstinoeBullPogloshenieAlert,
  IstinoeBearPogloshenieAlert,
} from '../interfaces';
import { PositionsStore } from '../positions.store';
import { TelegramNotifier } from '../adapters/notifier.telegram';

export interface ThreeAlertsConfig {
  symbol: string;
  maxPositions: number;
  positionSize: number;
  takeProfitPercent: number;
  stopLossPercent: number;
}

export interface ThreeAlertsState {
  activeAlerts: Set<string>;
  positions: Map<string, any>;
  lastUpdate: Date;
}

@Injectable()
export class ThreeAlertsStrategy implements Strategy {
  private readonly logger = new Logger(ThreeAlertsStrategy.name);
  private readonly strategyType = 'three-alerts';
  private config: ThreeAlertsConfig;
  private state: ThreeAlertsState;

  constructor(
    private readonly positionsStore: PositionsStore,
    private readonly notifier: TelegramNotifier,
  ) {
    this.state = {
      activeAlerts: new Set(),
      positions: new Map(),
      lastUpdate: new Date(),
    };
  }

  initialize(config: ThreeAlertsConfig): void {
    this.config = config;
    this.logger.log(
      `Initialized ${this.strategyType} strategy for ${config.symbol}`,
    );
  }

  getType(): string {
    return this.strategyType;
  }

  async processAlert(alert: any): Promise<void> {
    if (!this.config) {
      this.logger.error('Strategy not initialized');
      return;
    }

    const alertKey = this.createAlertKey(alert);
    this.state.activeAlerts.add(alertKey);
    this.state.lastUpdate = new Date();

    this.logger.log(`Processing alert: ${alertKey} for ${this.config.symbol}`);

    // Анализируем текущее состояние
    const activeAlerts = Array.from(this.state.activeAlerts);
    const currentPositions = Array.from(this.state.positions.values());

    // Определяем количество активных алертов каждого типа
    const bullAlerts = activeAlerts.filter((key) => key.includes('bull'));
    const bearAlerts = activeAlerts.filter((key) => key.includes('bear'));

    // Логика входа в позицию
    if (
      bullAlerts.length > 0 &&
      currentPositions.length < this.config.maxPositions
    ) {
      await this.enterLongPosition(alert);
    } else if (
      bearAlerts.length > 0 &&
      currentPositions.length < this.config.maxPositions
    ) {
      await this.enterShortPosition(alert);
    }

    // Логика управления позициями
    await this.managePositions(activeAlerts);
  }

  private createAlertKey(alert: any): string {
    return `${alert.alertName}_${alert.symbol}`;
  }

  private async enterLongPosition(alert: any): Promise<void> {
    const position = {
      id: `long_${Date.now()}`,
      symbol: this.config.symbol,
      side: 'long',
      size: this.config.positionSize,
      entryPrice: alert.price || 0,
      entryTime: new Date(),
      takeProfit: alert.price
        ? alert.price * (1 + this.config.takeProfitPercent / 100)
        : 0,
      stopLoss: alert.price
        ? alert.price * (1 - this.config.stopLossPercent / 100)
        : 0,
      status: 'open',
      strategy: this.strategyType,
    };

    this.state.positions.set(position.id, position);
    await this.positionsStore.open(
      'three-alerts-bot',
      this.config.symbol,
      position.entryPrice.toString(),
      position.size.toString(),
    );

    const message =
      `🚀 LONG позиция открыта\n` +
      `Символ: ${position.symbol}\n` +
      `Размер: ${position.size}\n` +
      `Цена входа: ${position.entryPrice}\n` +
      `Take Profit: ${position.takeProfit}\n` +
      `Stop Loss: ${position.stopLoss}\n` +
      `Стратегия: ${this.strategyType}`;

    await this.notifier.send(message);
    this.logger.log(`Opened LONG position: ${position.id}`);
  }

  private async enterShortPosition(alert: any): Promise<void> {
    const position = {
      id: `short_${Date.now()}`,
      symbol: this.config.symbol,
      side: 'short',
      size: this.config.positionSize,
      entryPrice: alert.price || 0,
      entryTime: new Date(),
      takeProfit: alert.price
        ? alert.price * (1 - this.config.takeProfitPercent / 100)
        : 0,
      stopLoss: alert.price
        ? alert.price * (1 + this.config.stopLossPercent / 100)
        : 0,
      status: 'open',
      strategy: this.strategyType,
    };

    this.state.positions.set(position.id, position);
    await this.positionsStore.open(
      'three-alerts-bot',
      this.config.symbol,
      position.entryPrice.toString(),
      position.size.toString(),
    );

    const message =
      `🔻 SHORT позиция открыта\n` +
      `Символ: ${position.symbol}\n` +
      `Размер: ${position.size}\n` +
      `Цена входа: ${position.entryPrice}\n` +
      `Take Profit: ${position.takeProfit}\n` +
      `Stop Loss: ${position.stopLoss}\n` +
      `Стратегия: ${this.strategyType}`;

    await this.notifier.send(message);
    this.logger.log(`Opened SHORT position: ${position.id}`);
  }

  private async managePositions(activeAlerts: string[]): Promise<void> {
    const currentPositions = Array.from(this.state.positions.values());

    for (const position of currentPositions) {
      if (position.status !== 'open') continue;

      // Проверяем противоположные сигналы для выхода
      const shouldExit = this.shouldExitPosition(position, activeAlerts);

      if (shouldExit) {
        await this.closePosition(position, 'signal_exit');
      }
    }
  }

  private shouldExitPosition(position: any, activeAlerts: string[]): boolean {
    if (position.side === 'long') {
      // Для лонга ищем медвежьи сигналы
      const bearSignals = activeAlerts.filter((alert) =>
        alert.includes('bear'),
      );
      return bearSignals.length > 0;
    } else {
      // Для шорта ищем бычьи сигналы
      const bullSignals = activeAlerts.filter((alert) =>
        alert.includes('bull'),
      );
      return bullSignals.length > 0;
    }
  }

  private async closePosition(position: any, reason: string): Promise<void> {
    position.status = 'closed';
    position.exitTime = new Date();
    position.exitPrice = position.entryPrice; // В реальности здесь должна быть текущая цена

    this.state.positions.delete(position.id);
    // В реальности здесь нужно найти позицию в базе и закрыть её

    const message =
      `🔒 Позиция закрыта\n` +
      `Символ: ${position.symbol}\n` +
      `Сторона: ${position.side === 'long' ? 'LONG' : 'SHORT'}\n` +
      `Причина: ${reason}\n` +
      `Цена входа: ${position.entryPrice}\n` +
      `Цена выхода: ${position.exitPrice}\n` +
      `Стратегия: ${this.strategyType}`;

    await this.notifier.send(message);
    this.logger.log(`Closed position: ${position.id}, reason: ${reason}`);
  }

  async getState(): Promise<ThreeAlertsState> {
    return this.state;
  }

  async cleanup(): Promise<void> {
    this.state.activeAlerts.clear();
    this.state.positions.clear();
    this.logger.log('Strategy cleaned up');
  }

  // Реализация методов интерфейса Strategy
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

  async onLongTrend(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onShortTrend(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onLongPivotPoint(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onShortPivotPoint(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onStrongLongPivotPoint(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onStrongShortPivotPoint(bot: any, alert: any): Promise<void> {
    // Не используется в этой стратегии
  }

  async onBullRelsi(bot: any, alert: any): Promise<void> {
    await this.processAlert(alert);
  }

  async onBearRelsi(bot: any, alert: any): Promise<void> {
    await this.processAlert(alert);
  }

  async onBullMarubozu(bot: any, alert: any): Promise<void> {
    await this.processAlert(alert);
  }

  async onBearMarubozu(bot: any, alert: any): Promise<void> {
    await this.processAlert(alert);
  }

  async onIstinoeBullPogloshenie(bot: any, alert: any): Promise<void> {
    await this.processAlert(alert);
  }

  async onIstinoeBearPogloshenie(bot: any, alert: any): Promise<void> {
    await this.processAlert(alert);
  }
}
