import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Strategy } from '../interfaces';
import { PositionsStore } from '../positions.store';
import { TelegramService } from '../../services/telegram.service';

export interface DominationPosition {
  id: string;
  botName: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: string;
  entryTime: Date;
  lastContinuation: Date;
  status: 'open' | 'closed';
}

@Injectable()
export class DominationStrategy
  implements Strategy, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DominationStrategy.name);
  private continuationCheckInterval: NodeJS.Timeout;

  onModuleInit() {
    // Запускаем проверку continuation каждые 5 минут
    this.continuationCheckInterval = setInterval(
      () => {
        this.checkContinuationTimeouts();
      },
      5 * 60 * 1000,
    ); // 5 минут
  }

  onModuleDestroy() {
    if (this.continuationCheckInterval) {
      clearInterval(this.continuationCheckInterval);
    }
  }

  constructor(
    private readonly store: PositionsStore,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Проверяет таймауты continuation (30 минут)
   */
  private async checkContinuationTimeouts(): Promise<void> {
    this.logger.debug(
      '🔍 Проверяю таймауты continuation для Domination позиций',
    );

    // Получаем все открытые позиции из БД
    const openPositions = await this.store.getAllOpenPositions();

    for (const position of openPositions) {
      // Проверяем только Domination позиции по meta.type
      if (position.meta?.type === 'domination') {
        const now = new Date();
        const lastUpdate = position.meta?.lastContinuation || position.openedAt;
        if (lastUpdate) {
          const timeSinceLastUpdate =
            now.getTime() - new Date(lastUpdate).getTime();
          const timeoutMs = 30 * 60 * 1000; // 30 минут

          if (timeSinceLastUpdate > timeoutMs) {
            this.logger.log(
              `⏰ Continuation timeout для ${position.symbol} (${position.botName}) - закрываю позицию`,
            );
            await this.closePosition(position, 'Continuation timeout');
          }
        }
      }
    }
  }

  /**
   * Открывает длинную позицию (Buyer Domination)
   */
  async onBuyerDomination(bot: any, alert: any): Promise<void> {
    this.logger.log(
      `🚀 Открываю LONG позицию для ${alert.symbol} (${bot.name})`,
    );

    // Проверяем, нет ли уже открытой позиции
    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (existing) {
      this.logger.log(
        `⚠️ Позиция ${alert.symbol} уже открыта для ${bot.name}, пропускаю`,
      );
      return;
    }

    // Создаем позицию в БД
    const position = await this.store.open(
      bot.name,
      alert.symbol,
      alert.price,
      '200', // Фиксированный размер для Domination
    );

    // Добавляем дополнительную информацию для Domination в meta
    position.meta = {
      type: 'domination',
      side: 'long',
      lastContinuation: new Date(),
    };
    await this.store.updatePosition(position);

    this.logger.log(`✅ LONG позиция создана в БД с ID: ${position.id}`);

    // Отправляем уведомление
    await bot.notify(
      `🟢 ${bot.name}: LONG ${alert.symbol} @${alert.price}\n` +
        `💰 Размер: $200\n` +
        `📅 Вход: ${position.openedAt?.toLocaleString() || 'N/A'}\n` +
        `💡 Ожидаю continuation каждые 30 минут`,
    );
  }

  /**
   * Открывает короткую позицию (Seller Domination)
   */
  async onSellerDomination(bot: any, alert: any): Promise<void> {
    this.logger.log(
      `🔴 Открываю SHORT позицию для ${alert.symbol} (${bot.name})`,
    );

    // Проверяем, нет ли уже открытой позиции
    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (existing) {
      this.logger.log(
        `⚠️ Позиция ${alert.symbol} уже открыта для ${bot.name}, пропускаю`,
      );
      return;
    }

    // Создаем позицию в БД
    const position = await this.store.open(
      bot.name,
      alert.symbol,
      alert.price,
      '200', // Фиксированный размер для Domination
    );

    // Добавляем дополнительную информацию для Domination в meta
    position.meta = {
      type: 'domination',
      side: 'short',
      lastContinuation: new Date(),
    };
    await this.store.updatePosition(position);

    this.logger.log(`✅ SHORT позиция создана в БД с ID: ${position.id}`);

    // Отправляем уведомление
    await bot.notify(
      `🔴 ${bot.name}: SHORT ${alert.symbol} @${alert.price}\n` +
        `💰 Размер: $200\n` +
        `📅 Вход: ${position.openedAt?.toLocaleString() || 'N/A'}\n` +
        `💡 Ожидаю continuation каждые 30 минут`,
    );
  }

  /**
   * Обрабатывает continuation для длинной позиции
   */
  async onBuyerContinuation(bot: any, alert: any): Promise<void> {
    this.logger.log(`📈 Buyer continuation для ${alert.symbol} (${bot.name})`);

    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (
      !existing ||
      existing.meta?.type !== 'domination' ||
      existing.meta?.side !== 'long'
    ) {
      this.logger.log(
        `⚠️ Нет открытой LONG Domination позиции ${alert.symbol} для ${bot.name}`,
      );
      return;
    }

    // Обновляем время последнего continuation
    existing.meta.lastContinuation = new Date();
    await this.store.updatePosition(existing);

    // Отправляем уведомление
    await bot.notify(
      `📈 ${bot.name}: Buyer continuation ${alert.symbol} @${alert.price}\n` +
        `⏰ Обновлено: ${existing.meta.lastContinuation.toLocaleString()}\n` +
        `⏳ Следующее ожидание: через 30 минут`,
    );
  }

  /**
   * Обрабатывает continuation для короткой позиции
   */
  async onSellerContinuation(bot: any, alert: any): Promise<void> {
    this.logger.log(`📉 Seller continuation для ${alert.symbol} (${bot.name})`);

    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (
      !existing ||
      existing.meta?.type !== 'domination' ||
      existing.meta?.side !== 'short'
    ) {
      this.logger.log(
        `⚠️ Нет открытой SHORT Domination позиции ${alert.symbol} для ${bot.name}`,
      );
      return;
    }

    // Обновляем время последнего continuation
    existing.meta.lastContinuation = new Date();
    await this.store.updatePosition(existing);

    // Отправляем уведомление
    await bot.notify(
      `📉 ${bot.name}: Seller continuation ${alert.symbol} @${alert.price}\n` +
        `⏰ Обновлено: ${existing.meta.lastContinuation.toLocaleString()}\n` +
        `⏳ Следующее ожидание: через 30 минут`,
    );
  }

  /**
   * Закрывает позицию
   */
  private async closePosition(
    position: any,
    reason: string,
    bot?: any,
  ): Promise<void> {
    this.logger.log(
      `🛑 Закрываю позицию ${position.symbol} (${position.botName}): ${reason}`,
    );

    // Закрываем позицию в БД
    await this.store.close(position, position.avgEntryPrice);

    const exitTime = new Date();
    const duration = this.calculateDuration(position.openedAt, exitTime);

    // Логируем закрытие позиции
    this.logger.log(
      `✅ ${position.botName}: ${position.meta?.side?.toUpperCase() || 'UNKNOWN'} ${position.symbol} ЗАКРЫТА\n` +
        `💰 Вход: $${position.avgEntryPrice}\n` +
        `📅 Вход: ${position.openedAt?.toLocaleString() || 'N/A'}\n` +
        `📅 Выход: ${exitTime.toLocaleString()}\n` +
        `⏱️ Длительность: ${duration}\n` +
        `📝 Причина: ${reason}`,
    );

    // Отправляем уведомление о выходе из позиции
    try {
      const sideEmoji = position.meta?.side === 'long' ? '🟢' : '🔴';
      const sideText = position.meta?.side === 'long' ? 'LONG' : 'SHORT';

      const message =
        `${sideEmoji} ${position.botName}: ${sideText} ${position.symbol} ЗАКРЫТА\n` +
        `💰 Вход: $${position.avgEntryPrice}\n` +
        `📅 Вход: ${position.openedAt?.toLocaleString() || 'N/A'}\n` +
        `📅 Выход: ${exitTime.toLocaleString()}\n` +
        `⏱️ Длительность: ${duration}\n` +
        `📝 Причина: ${reason}`;

      if (bot && bot.notify) {
        // Если передан объект бота, используем его для уведомления
        await bot.notify(message);
      } else {
        // Иначе отправляем через TelegramService
        await this.telegramService.sendMessage(message, 'domination');
      }
    } catch (error) {
      this.logger.error(
        `❌ Ошибка отправки уведомления о выходе: ${error.message}`,
      );
    }
  }

  /**
   * Рассчитывает длительность позиции
   */
  private calculateDuration(entryTime: Date | null, exitTime: Date): string {
    if (!entryTime) return 'N/A';

    const diffMs = exitTime.getTime() - entryTime.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }
    return `${minutes}м`;
  }

  /**
   * Получает все открытые Domination позиции
   */
  async getAllOpenPositions(): Promise<any[]> {
    // Получаем все открытые позиции из БД
    const openPositions = await this.store.getAllOpenPositions();

    // Фильтруем только Domination позиции
    return openPositions.filter((pos) => pos.meta?.type === 'domination');
  }

  /**
   * Получает позицию по боту и символу
   */
  async getPosition(botName: string, symbol: string): Promise<any | null> {
    const position = await this.store.findOpen(botName, symbol);
    // Возвращаем только если это Domination позиция
    return position && position.meta?.type === 'domination' ? position : null;
  }

  /**
   * Очищает все позиции (только для тестирования)
   */
  async clearAllPositions(): Promise<void> {
    this.logger.log(
      '🧹 Очистка всех позиций Domination (только для тестирования)',
    );
    // В продакшене лучше не очищать все позиции
    // Можно добавить метод в PositionsStore для очистки по типу
  }

  // Реализация интерфейса Strategy (не используется для этой стратегии)
  async onOpen(bot: any, alert: any): Promise<void> {
    // Не используется
  }

  async onAdd(bot: any, alert: any): Promise<void> {
    // Не используется
  }

  async onClose(bot: any, alert: any): Promise<void> {
    // Не используется
  }

  async onBigClose(bot: any, alert: any): Promise<void> {
    // Не используется
  }

  async onBigAdd(bot: any, alert: any): Promise<void> {
    // Не используется
  }

  async onSmartVolumeOpen(bot: any, alert: any): Promise<void> {
    // Не используется
  }

  async onBullishVolume(bot: any, alert: any): Promise<void> {
    // Не используется
  }

  async onVolumeUp(bot: any, alert: any): Promise<void> {
    // Не используется
  }
}
