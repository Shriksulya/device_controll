import { Controller, Post, Param, Logger } from '@nestjs/common';
import { BotsScheduler } from './scheduler.service';

@Controller('/scheduler')
export class SchedulerController {
  private readonly logger = new Logger(SchedulerController.name);

  constructor(private readonly scheduler: BotsScheduler) {}

  @Post('/test-trend-report/:botName')
  async testTrendReport(@Param('botName') botName: string) {
    this.logger.log(`🧪 Тестирую отправку отчета о тренде для бота ${botName}`);

    try {
      // Находим бота по имени
      const bots = this.scheduler.registry.all();
      const bot = bots.find((b: any) => b.name === botName);

      if (!bot) {
        return {
          ok: false,
          error: `Бот ${botName} не найден`,
          availableBots: bots.map((b: any) => b.name),
        };
      }

      // Отправляем тестовый отчет
      await this.scheduler.sendTrendReport(bot);

      return {
        ok: true,
        message: `Тестовый отчет о тренде отправлен для ${botName}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Ошибка тестирования отчета: ${error.message}`);
      return {
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('/send-all-trend-reports')
  async sendAllTrendReports() {
    this.logger.log(`📊 Отправляю отчеты о тренде для всех ботов`);

    try {
      const bots = this.scheduler.registry.all();
      const results: { bot: string; status: string; error?: string }[] = [];

      for (const bot of bots) {
        try {
          await this.scheduler.sendTrendReport(bot);
          results.push({ bot: bot.name, status: 'success' });
        } catch (error: any) {
          results.push({
            bot: bot.name,
            status: 'error',
            error: error.message,
          });
        }
      }

      return {
        ok: true,
        message: 'Отчеты о тренде отправлены',
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Ошибка отправки отчетов: ${error.message}`);
      return {
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
