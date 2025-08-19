import { Injectable, Logger } from '@nestjs/common';
import { BotsRegistry } from './bots.registry';
import { parseIntervalMs } from './utils';

@Injectable()
export class BotsScheduler {
  private readonly log = new Logger(BotsScheduler.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(public readonly registry: BotsRegistry) {}

  start() {
    for (const bot of this.registry.all()) {
      const c = bot.cfg;
      if (!c.scheduled_notification || !c.scheduled_time) continue;
      const ms = parseIntervalMs(c.scheduled_time);
      this.log.log(`Schedule ${bot.name}: every ${c.scheduled_time}`);
      const t = setInterval(async () => {
        await this.sendTrendReport(bot);
      }, ms);
      this.timers.push(t);
    }
  }

  public async sendTrendReport(bot: any) {
    try {
      const c = bot.cfg;
      this.log.log(`📊 Отправляю отчет о тренде для ${bot.name}`);

      // Получаем текущий тренд по всем таймфреймам бота
      const trendResults = await Promise.all(
        c.timeframe_trend.map(async (tf) => {
          // Получаем тренд для конкретного таймфрейма
          const trend = await bot.trend.getCurrent(
            bot.cfg.symbol_filter?.[0] || 'BTCUSDT',
            tf,
          );
          return { timeframe: tf, trend };
        }),
      );

      // Формируем сообщение о тренде
      let trendMessage = `📊 ${bot.name} - Отчет о тренде\n`;
      trendMessage += `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n`;
      trendMessage += `🎯 Направление бота: ${c.direction.toUpperCase()}\n`;
      trendMessage += `📈 Таймфреймы: ${c.timeframe_trend.join(', ')}\n`;
      if (c.symbol_filter && c.symbol_filter.length > 0) {
        trendMessage += `🎯 Символы: ${c.symbol_filter.join(', ')}\n`;
      }
      trendMessage += `\n`;

      trendResults.forEach(({ timeframe, trend }) => {
        const emoji =
          trend === c.direction ? '✅' : trend === 'neutral' ? '⚪' : '❌';
        trendMessage += `${emoji} ${timeframe}: ${trend.toUpperCase()}\n`;
      });

      // Определяем общий статус тренда
      const allTrends = trendResults.map((r) => r.trend);
      const trendStatus = this.getTrendStatus(allTrends, c.direction);
      trendMessage += `\n📈 Общий статус: ${trendStatus}`;

      // Добавляем рекомендации
      if (trendStatus.includes('СИЛЬНЫЙ')) {
        trendMessage += `\n💡 РЕКОМЕНДАЦИЯ: Тренд сильный, можно открывать позиции`;
      } else if (trendStatus.includes('ПРОТИВОПОЛОЖНЫЙ')) {
        trendMessage += `\n⚠️ РЕКОМЕНДАЦИЯ: Тренд развернулся, закрывайте позиции`;
      } else if (trendStatus.includes('СМЕШАННЫЙ')) {
        trendMessage += `\n🔄 РЕКОМЕНДАЦИЯ: Тренд смешанный, будьте осторожны`;
      } else {
        trendMessage += `\n⏸ РЕКОМЕНДАЦИЯ: Тренд нейтральный, ждите четкого сигнала`;
      }

      // Отправляем уведомление
      await bot.notify(trendMessage);
      this.log.log(`✅ Отчет о тренде отправлен для ${bot.name}`);
    } catch (error) {
      this.log.error(
        `❌ Ошибка отправки отчета о тренде для ${bot.name}: ${error.message}`,
      );
    }
  }

  private getTrendStatus(trends: string[], botDirection: string): string {
    const longCount = trends.filter((t) => t === 'long').length;
    const shortCount = trends.filter((t) => t === 'short').length;
    const neutralCount = trends.filter((t) => t === 'neutral').length;

    if (trends.every((t) => t === botDirection)) {
      return `🟢 СИЛЬНЫЙ ${botDirection.toUpperCase()} - все таймфреймы совпадают`;
    } else if (trends.some((t) => t === botDirection)) {
      return `🟡 СМЕШАННЫЙ ${botDirection.toUpperCase()} - частично совпадает`;
    } else if (trends.every((t) => t === 'neutral')) {
      return `⚪ НЕЙТРАЛЬНЫЙ - нет четкого направления`;
    } else {
      const oppositeDirection = botDirection === 'long' ? 'short' : 'long';
      return `🔴 ПРОТИВОПОЛОЖНЫЙ ${oppositeDirection.toUpperCase()} - тренд развернулся`;
    }
  }
}
