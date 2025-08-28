import { Strategy } from '../interfaces';
import { toBitgetSymbolId } from '../utils';
import { PositionsStore } from '../positions.store';
import { Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TrendConfirmationEntity,
  TrendDirection,
} from '../../entities/trend-confirmation.entity';

export class TrendPivotStrategy implements Strategy {
  private readonly logger = new Logger(TrendPivotStrategy.name);

  constructor(
    @InjectRepository(TrendConfirmationEntity)
    private readonly trendRepo: Repository<TrendConfirmationEntity>,
    private readonly store: PositionsStore,
  ) {}

  // Сохраняем подтверждение тренда в БД (перезаписывает предыдущее)
  private async saveTrendConfirmation(
    symbol: string,
    timeframe: string,
    direction: TrendDirection,
    source: string,
    meta?: any,
  ): Promise<void> {
    try {
      // Удаляем предыдущие подтверждения для этого символа и таймфрейма
      await this.trendRepo.delete({ symbol, timeframe });

      // Создаем новое подтверждение
      const confirmation = this.trendRepo.create({
        symbol,
        timeframe,
        direction,
        source,
        meta,
        expiresAt: new Date('2030-12-31T23:59:59Z'), // Устанавливаем далекую дату в будущем
      });

      await this.trendRepo.save(confirmation);
      this.logger.log(
        `💾 Сохранено подтверждение тренда: ${direction} для ${symbol} на ${timeframe}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Ошибка сохранения подтверждения тренда: ${error.message}`,
      );
    }
  }

  // Получаем количество подтверждений для направления тренда
  private async getTrendConfirmationCount(
    symbol: string,
    timeframe: string,
    direction: TrendDirection,
  ): Promise<number> {
    try {
      const confirmations = await this.trendRepo.find({
        where: { symbol, timeframe, direction },
      });
      return confirmations.length;
    } catch (error) {
      this.logger.error(
        `❌ Ошибка получения количества подтверждений: ${error.message}`,
      );
      return 0;
    }
  }

  // Получаем текущее направление тренда из БД
  private async getCurrentTrendDirection(
    symbol: string,
    timeframe: string,
  ): Promise<TrendDirection | null> {
    try {
      const confirmation = await this.trendRepo.findOne({
        where: { symbol, timeframe },
        order: { createdAt: 'DESC' },
      });
      return confirmation?.direction || null;
    } catch (error) {
      this.logger.error(
        `❌ Ошибка получения направления тренда: ${error.message}`,
      );
      return null;
    }
  }

  // Проверяем, можно ли войти в позицию
  private async canEnterPosition(
    bot: any,
    symbol: string,
    timeframe: string,
  ): Promise<boolean> {
    try {
      // Получаем направления трендов
      const timeframeDirection = await this.getCurrentTrendDirection(
        symbol,
        timeframe,
      );
      const fourHourDirection = await this.getCurrentTrendDirection(
        symbol,
        '4h',
      );

      // Входим только если направления совпадают и не нейтральные
      return !!(
        timeframeDirection &&
        fourHourDirection &&
        timeframeDirection === fourHourDirection
      );
    } catch (error) {
      this.logger.error(`❌ Ошибка проверки входа в позицию: ${error.message}`);
      return false;
    }
  }

  // Проверяем, нужно ли выйти из позиции
  private async shouldExitPosition(
    bot: any,
    symbol: string,
    timeframe: string,
  ): Promise<boolean> {
    try {
      const timeframeDirection = await this.getCurrentTrendDirection(
        symbol,
        timeframe,
      );
      const fourHourDirection = await this.getCurrentTrendDirection(
        symbol,
        '4h',
      );

      // Выходим если направления не совпадают или один из трендов изменился
      return (
        !timeframeDirection ||
        !fourHourDirection ||
        timeframeDirection !== fourHourDirection
      );
    } catch (error) {
      this.logger.error(
        `❌ Ошибка проверки выхода из позиции: ${error.message}`,
      );
      return false;
    }
  }

  // Обработка long trend алерта
  async onLongTrend(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `📈 Long Trend для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    // Сохраняем в БД
    await this.saveTrendConfirmation(alert.symbol, timeframe, 'long', 'trend', {
      type: 'trend',
      botName: bot.name,
    });

    // Обрабатываем изменение тренда
    if (timeframe === '4h') {
      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка short trend алерта
  async onShortTrend(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `📉 Short Trend для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    // Сохраняем в БД
    await this.saveTrendConfirmation(
      alert.symbol,
      timeframe,
      'short',
      'trend',
      { type: 'trend', botName: bot.name },
    );

    // Обрабатываем изменение тренда
    if (timeframe === '4h') {
      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка long pivot point алерта
  async onLongPivotPoint(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `📊 Long Pivot Point для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    // Сохраняем в БД
    await this.saveTrendConfirmation(alert.symbol, timeframe, 'long', 'pivot', {
      type: 'pivot',
      botName: bot.name,
    });

    // Обрабатываем изменение тренда
    if (timeframe === '4h') {
      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка short pivot point алерта
  async onShortPivotPoint(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `📊 Short Pivot Point для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    // Сохраняем в БД
    await this.saveTrendConfirmation(
      alert.symbol,
      timeframe,
      'short',
      'pivot',
      { type: 'pivot', botName: bot.name },
    );

    // Обрабатываем изменение тренда
    if (timeframe === '4h') {
      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка strong long pivot point алерта
  async onStrongLongPivotPoint(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `🚀 Strong Long Pivot Point для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    // Сохраняем в БД
    await this.saveTrendConfirmation(
      alert.symbol,
      timeframe,
      'long',
      'strong-pivot',
      { type: 'strong-pivot', botName: bot.name },
    );

    // Обрабатываем изменение тренда
    if (timeframe === '4h') {
      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка strong short pivot point алерта
  async onStrongShortPivotPoint(bot: any, alert: any): Promise<void> {
    const timeframe = alert.timeframe || '15m';
    this.logger.log(
      `🚀 Strong Short Pivot Point для ${alert.symbol} на ${timeframe} (${bot.name})`,
    );

    // Сохраняем в БД
    await this.saveTrendConfirmation(
      alert.symbol,
      timeframe,
      'short',
      'strong-pivot',
      { type: 'strong-pivot', botName: bot.name },
    );

    // Обрабатываем изменение тренда
    if (timeframe === '4h') {
      await this.processFourHourTrendChange(bot, alert.symbol);
    } else {
      await this.processTrendChange(bot, alert.symbol, timeframe);
    }
  }

  // Обработка изменения тренда для 15m/1h
  private async processTrendChange(
    bot: any,
    symbol: string,
    timeframe: string,
  ): Promise<void> {
    try {
      const existing = await this.store.findOpen(bot.name, symbol);

      if (existing) {
        // Проверяем, нужно ли выйти из позиции
        if (await this.shouldExitPosition(bot, symbol, timeframe)) {
          this.logger.log(
            `🔄 Тренд изменился для ${symbol} на ${timeframe} - выходим из позиции`,
          );
          await this.exitPosition(bot, symbol, existing, timeframe);
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
    } catch (error) {
      this.logger.error(`❌ Ошибка в processTrendChange: ${error.message}`);
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
      await this.processTrendChange(bot, symbol, timeframe);
    }
  }

  // Вход в позицию
  private async enterPosition(
    bot: any,
    symbol: string,
    timeframe: string,
  ): Promise<void> {
    try {
      const existing = await this.store.findOpen(bot.name, symbol);
      if (existing) {
        this.logger.log(`⚠️ Позиция ${symbol} уже открыта для ${bot.name}`);
        return;
      }

      const symbolId = toBitgetSymbolId(symbol);
      const price = '0'; // Цена будет получена при исполнении

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

      // Сохраняем исходное направление тренда в meta позиции
      position.meta = position.meta || {};
      position.meta.originalDirection = await this.getCurrentTrendDirection(
        symbol,
        timeframe,
      );
      await this.store.updatePosition(position);

      await bot.notify(
        `✅ ${bot.name}: TREND ENTRY ${symbol} на ${timeframe}\n` +
          `💰 Размер: $${baseUsd}\n` +
          `📊 Направление: ${await this.getCurrentTrendDirection(symbol, timeframe)}`,
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

  // Выход из позиции с частичным закрытием
  private async exitPosition(
    bot: any,
    symbol: string,
    position: any,
    timeframe: string,
  ): Promise<void> {
    try {
      // Получаем количество подтверждений для исходного направления позиции
      // (когда тренд меняется, мы закрываем позицию в зависимости от силы исходного тренда)
      const originalDirection = position.meta?.originalDirection || 'long';
      const confirmationCount = await this.getTrendConfirmationCount(
        symbol,
        timeframe,
        originalDirection,
      );

      let closePercentage = 100; // По умолчанию закрываем всю позицию

      // Логика частичного закрытия в зависимости от количества подтверждений
      if (confirmationCount === 1) {
        closePercentage = 100; // Закрываем всю позицию
      } else if (confirmationCount === 2) {
        closePercentage = 50; // Закрываем 50%
      } else if (confirmationCount >= 3) {
        closePercentage = 33; // Закрываем 33%
      }

      this.logger.log(
        `🔄 Закрываем ${closePercentage}% позиции ${symbol} (${confirmationCount} подтверждений)`,
      );

      if (closePercentage === 100) {
        // Закрываем всю позицию
        await bot.exchange.flashClose?.(symbol, 'long');
        await this.store.close(position, '0');

        await bot.notify(
          `🛑 ${bot.name}: TREND EXIT ${symbol}\n` +
            `📊 Тренд изменился - позиция полностью закрыта`,
        );
      } else {
        // Частичное закрытие
        const currentAmount = parseFloat(position.amountUsd);
        const closeAmount = (currentAmount * closePercentage) / 100;

        // Закрываем часть позиции на бирже
        try {
          await bot.exchange.flashClose?.(
            symbol,
            'long',
            closeAmount.toString(),
          );
        } catch (error) {
          this.logger.warn(
            `⚠️ Частичное закрытие не поддерживается, закрываем всю позицию: ${error.message}`,
          );
          await bot.exchange.flashClose?.(symbol, 'long');
          await this.store.close(position, '0');
          return;
        }

        // Обновляем позицию в БД с информацией о закрытых подтверждениях
        position.amountUsd = (currentAmount - closeAmount).toString();
        position.meta = position.meta || {};
        position.meta.closedConfirmations =
          (position.meta.closedConfirmations || 0) + 1;
        await this.store.updatePosition(position);

        await bot.notify(
          `🔄 ${bot.name}: PARTIAL TREND EXIT ${symbol}\n` +
            `📊 Закрыто ${closePercentage}% позиции (${confirmationCount} подтверждений)\n` +
            `💰 Остаток: $${(currentAmount - closeAmount).toFixed(2)}`,
        );
      }
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
