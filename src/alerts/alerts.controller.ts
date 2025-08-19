import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Logger,
  Get,
  Param,
} from '@nestjs/common';
import { BotsRegistry } from '../bot-core/bots.registry';
import { TelegramService } from '../services/telegram.service';

@Controller('/alerts')
export class AlertsController {
  private readonly logger = new Logger(AlertsController.name);

  constructor(
    private readonly reg: BotsRegistry,
    private readonly telegram: TelegramService,
  ) {}

  @Post()
  async handle(@Body() p: any) {
    this.logger.log(`📨 Получен алерт: ${JSON.stringify(p)}`);

    if (!p || typeof p !== 'object' || !p.alertName)
      throw new BadRequestException('SmartVol payload required');

    const type = String(p.alertName);
    if (!['SmartVolOpen', 'SmartVolAdd', 'SmartVolClose'].includes(type))
      throw new BadRequestException(`Unknown type ${type}`);

    const alert = {
      kind: 'smartvol',
      type,
      symbol: String(p.symbol),
      price: String(p.price),
      timeframe: p.timeframe,
    };

    this.logger.log(`🔍 Обрабатываю алерт: ${JSON.stringify(alert)}`);

    const bots = this.reg.all();
    this.logger.log(`🤖 Найдено ботов: ${bots.length}`);

    for (const bot of bots) {
      this.logger.log(`🤖 Обрабатываю бота: ${bot.name}`);

      const filter = bot.cfg.symbol_filter || [];
      if (filter.length && !filter.includes(alert.symbol)) {
        this.logger.log(
          `⏭️ Бот ${bot.name} пропускает ${alert.symbol} (фильтр: ${filter.join(',')})`,
        );
        continue;
      }

      this.logger.log(`✅ Бот ${bot.name} обрабатывает ${alert.symbol}`);
      await bot.process(alert as any);
    }

    this.logger.log(`✅ Алерт обработан успешно`);
    return { ok: true };
  }

  @Get('/test-telegram/:botType')
  async testTelegram(@Param('botType') botType: string) {
    this.logger.log(`🧪 Тестирую телеграм для ${botType}`);

    if (!['bot1', 'bot2', 'bot3', 'bot4'].includes(botType)) {
      throw new BadRequestException(`Invalid bot type: ${botType}`);
    }

    try {
      const result = await this.telegram.testConnection(botType as any);
      if (result) {
        // Отправляем тестовое сообщение
        await this.telegram.sendMessage(
          `🧪 Тестовое сообщение от ${botType} - ${new Date().toISOString()}`,
          botType as any,
        );
        return {
          ok: true,
          message: `Telegram test successful for ${botType}`,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          ok: false,
          message: `Telegram test failed for ${botType}`,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error(`❌ Ошибка тестирования телеграма: ${error.message}`);
      return {
        ok: false,
        message: `Telegram test error: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('/send-telegram/:botType')
  async sendTelegram(
    @Param('botType') botType: string,
    @Body() body: { message: string },
  ) {
    this.logger.log(
      `📤 Отправляю сообщение в телеграм через ${botType}: ${body.message}`,
    );

    if (!['bot1', 'bot2', 'bot3', 'bot4'].includes(botType)) {
      throw new BadRequestException(`Invalid bot type: ${botType}`);
    }

    if (!body.message) {
      throw new BadRequestException('Message is required');
    }

    try {
      await this.telegram.sendMessage(body.message, botType as any);
      return {
        ok: true,
        message: `Message sent successfully via ${botType}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Ошибка отправки сообщения: ${error.message}`);
      return {
        ok: false,
        message: `Failed to send message: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
