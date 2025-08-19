import { Strategy } from '../interfaces';
import { toBitgetSymbolId } from '../utils';
import { PositionsStore } from '../positions.store';
import { Logger } from '@nestjs/common';

export class SmartVolDefaultStrategy implements Strategy {
  private readonly logger = new Logger(SmartVolDefaultStrategy.name);

  constructor(private readonly store: PositionsStore) {}

  async onOpen(bot, alert) {
    this.logger.log(`🚀 Стратегия onOpen для ${alert.symbol} @${alert.price}`);

    if (bot.mustCheckTrend()) {
      // Используем первый таймфрейм для проверки тренда
      const trendTimeframe = bot.cfg.timeframe_trend[0];
      this.logger.log(
        `🔍 Проверяю тренд для ${alert.symbol} по таймфрейму тренда: ${trendTimeframe}`,
      );

      // Проверяем тренд только по первому таймфрейму
      const trendDirection = await bot.trend.getCurrent(
        alert.symbol,
        trendTimeframe,
      );

      this.logger.log(
        `📊 Тренд для ${alert.symbol} по ${trendTimeframe}: ${trendDirection}, направление бота: ${bot.cfg.direction}`,
      );

      if (trendDirection !== bot.cfg.direction) {
        this.logger.log(`⏸ Тренд не совпадает, пропускаю`);
        await bot.notify(
          `⏸ ${bot.name}: тренд ${trendDirection} не совпадает с направлением бота ${bot.cfg.direction} (тренд: ${trendTimeframe})`,
        );
        return;
      }
      this.logger.log(`✅ Тренд совпадает, продолжаю`);
    }
    this.logger.log(`🔍 Проверяю существующую позицию для ${alert.symbol}`);
    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (existing) {
      this.logger.log(
        `📊 Найдена существующая позиция: ${existing.fillsCount}/${bot.cfg.maxFills ?? 4} заполнений`,
      );
      if (existing.fillsCount >= (bot.cfg.maxFills ?? 4)) {
        this.logger.log(`⚠️ Достигнут максимум заполнений`);
        await bot.notify(
          `⚠️ ${bot.name}: max fills reached for ${alert.symbol}`,
        );
        return;
      }
      this.logger.log(`➕ Переходим к докупке`);
      return this.onAdd(bot, alert); // уже открыта → докупка
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

    // Получаем полную информацию о позиции
    const positionInfo = this.store.getPositionInfo(
      position,
      Number(alert.price),
    );

    await bot.notify(
      `✅ ${bot.name}: OPEN ${alert.symbol} @${alert.price} $${baseUsd}\n` +
        `📊 Размер: ${positionInfo.pnl?.totalSize || '0'} ${alert.symbol.replace('USDT', '')}\n` +
        `💰 Средняя цена: $${positionInfo.pnl?.avgEntryPrice || alert.price}\n` +
        `📈 Текущая цена: $${positionInfo.pnl?.currentPrice || alert.price}\n` +
        `💵 PnL: $${positionInfo.pnl?.pnl || '0'} (${positionInfo.pnl?.pnlPercent || '0'}%)`,
    );
  }

  async onAdd(bot, alert) {
    this.logger.log(`➕ Стратегия onAdd для ${alert.symbol} @${alert.price}`);

    if (bot.mustCheckTrend()) {
      this.logger.log(
        `🔍 Проверяю тренд для докупки ${alert.symbol} по таймфреймам: ${bot.cfg.timeframe_trend.join(',')}`,
      );

      // Для докупки используем более строгую проверку - все таймфреймы должны совпадать
      const canAdd = await bot.canAddPosition(alert.symbol);
      const mainTimeframe = bot.getMainTimeframe();

      this.logger.log(
        `📊 Можно докупать ${alert.symbol}: ${canAdd}, главный таймфрейм: ${mainTimeframe}`,
      );

      if (!canAdd) {
        this.logger.log(
          `⏸ Докупка не разрешена - тренды не совпадают по всем таймфреймам`,
        );
        await bot.notify(
          `⏸ ${bot.name}: докупка ${alert.symbol} не разрешена - тренды не совпадают по всем таймфреймам (${bot.cfg.timeframe_trend.join(',')})`,
        );
        return;
      }
      this.logger.log(`✅ Докупка разрешена, продолжаю`);
    }

    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (!existing) return this.onOpen(bot, alert);

    if (existing.fillsCount >= (bot.cfg.maxFills ?? 4)) {
      await bot.notify(`⚠️ ${bot.name}: max fills reached for ${alert.symbol}`);
      return;
    }

    // Проверяем тренд при докупке
    if (bot.mustCheckTrend()) {
      this.logger.log(
        `🔍 Проверяю тренд для докупки ${alert.symbol} по таймфреймам: ${bot.cfg.timeframe_trend.join(',')}`,
      );
      const trendDirection = await bot.trendAgrees(alert.symbol);
      this.logger.log(
        `📊 Тренд для докупки ${alert.symbol}: ${trendDirection}, направление бота: ${bot.cfg.direction}`,
      );

      if (trendDirection !== bot.cfg.direction) {
        this.logger.log(`⏸ Тренд не совпадает при докупке, пропускаю`);
        await bot.notify(
          `⏸ ${bot.name}: тренд ${trendDirection} не совпадает с направлением бота ${bot.cfg.direction} при докупке (${bot.cfg.timeframe_trend.join(',')})`,
        );
        return;
      }
      this.logger.log(`✅ Тренд совпадает при докупке, продолжаю`);
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

    // Получаем обновленную информацию о позиции
    const updatedPosition = await this.store.findOpen(bot.name, alert.symbol);
    if (updatedPosition) {
      const positionInfo = this.store.getPositionInfo(
        updatedPosition,
        Number(alert.price),
      );

      await bot.notify(
        `➕ ${bot.name}: ADD ${alert.symbol} @${alert.price} $${addUsd}\n` +
          `📊 Новый размер: ${positionInfo.pnl?.totalSize || '0'} ${alert.symbol.replace('USDT', '')}\n` +
          `💰 Новая средняя цена: $${positionInfo.pnl?.avgEntryPrice || alert.price}\n` +
          `📈 Текущая цена: ${positionInfo.pnl?.currentPrice || alert.price}\n` +
          `💵 PnL: $${positionInfo.pnl?.pnl || '0'} (${positionInfo.pnl?.pnlPercent || '0'}%)`,
      );
    } else {
      await bot.notify(
        `➕ ${bot.name}: ADD ${alert.symbol} @${alert.price} $${addUsd}`,
      );
    }
  }

  async onClose(bot, alert) {
    // Проверяем тренд при закрытии с учетом иерархии
    if (bot.mustCheckTrend()) {
      this.logger.log(
        `🔍 Проверяю тренд для закрытия ${alert.symbol} по таймфреймам: ${bot.cfg.timeframe_trend.join(',')}`,
      );

      // Проверяем, нужно ли закрывать позицию (главный тренд развернулся)
      const shouldClose = await bot.shouldClosePosition(alert.symbol);
      const mainTimeframe = bot.getMainTimeframe();

      this.logger.log(
        `📊 Нужно закрывать ${alert.symbol}: ${shouldClose}, главный таймфрейм: ${mainTimeframe}, направление бота: ${bot.cfg.direction}`,
      );

      if (shouldClose) {
        this.logger.log(`🔄 Главный тренд развернулся, закрываю позицию`);
        await bot.notify(
          `🔄 ${bot.name}: главный тренд (${mainTimeframe}) развернулся, закрываю позицию ${alert.symbol}`,
        );
      } else {
        this.logger.log(
          `✅ Главный тренд не изменился, но закрываю по сигналу`,
        );
      }
    }

    // Проверяем существование позиции в БД перед попыткой закрытия
    const existing = await this.store.findOpen(bot.name, alert.symbol);
    if (!existing) {
      this.logger.log(
        `⚠️ Позиция ${alert.symbol} не найдена в БД для бота ${bot.name}`,
      );
      await bot.notify(
        `⚠️ ${bot.name}: позиция ${alert.symbol} не найдена в БД, пропускаю закрытие`,
      );
      return;
    }

    this.logger.log(
      `🔍 Найдена позиция ${alert.symbol} в БД, закрываю на бирже`,
    );

    try {
      // Пытаемся закрыть позицию на бирже
      await bot.exchange.flashClose?.(alert.symbol, 'long');

      // Рассчитываем финальный PnL перед закрытием
      const finalPnL = this.store.calculatePnL(existing, Number(alert.price));
      await this.store.close(existing, alert.price);

      await bot.notify(
        `🛑 ${bot.name}: CLOSE ${alert.symbol} @${alert.price}\n` +
          `📊 Финальный размер: ${finalPnL.totalSize} ${alert.symbol.replace('USDT', '')}\n` +
          `💰 Средняя цена входа: $${finalPnL.avgEntryPrice}\n` +
          `📈 Цена закрытия: $${finalPnL.currentPrice}\n` +
          `💵 Финальный PnL: $${finalPnL.pnl} (${finalPnL.pnlPercent}%)`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при закрытии позиции ${alert.symbol}: ${error.message}`,
      );

      // Если позиция уже закрыта на бирже, но не в БД - закрываем в БД
      if (
        error.message?.includes('no position to close') ||
        error.message?.includes('22002')
      ) {
        this.logger.log(
          `ℹ️ Позиция ${alert.symbol} уже закрыта на бирже, обновляю БД`,
        );
        await this.store.close(existing, alert.price);
        await bot.notify(
          `ℹ️ ${bot.name}: позиция ${alert.symbol} уже была закрыта на бирже, обновлено в БД`,
        );
      } else {
        // Другие ошибки - уведомляем об ошибке
        await bot.notify(
          `❌ ${bot.name}: ошибка при закрытии позиции ${alert.symbol}: ${error.message}`,
        );
        throw error; // Пробрасываем ошибку дальше
      }
    }
  }
}
