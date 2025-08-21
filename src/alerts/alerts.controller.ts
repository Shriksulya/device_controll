import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Logger,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { BotsRegistry } from '../bot-core/bots.registry';
import { TelegramService } from '../services/telegram.service';
import { VolumeUpService } from '../services/volume-up.service';

@Controller('/alerts')
export class AlertsController {
  private readonly logger = new Logger(AlertsController.name);

  constructor(
    private readonly reg: BotsRegistry,
    private readonly telegram: TelegramService,
    private readonly volumeUpService: VolumeUpService,
  ) {}

  @Post()
  async handle(@Body() p: any) {
    this.logger.log(`📨 Получен алерт: ${JSON.stringify(p)}`);

    if (!p || typeof p !== 'object' || !p.alertName)
      throw new BadRequestException('SmartVol payload required');

    const type = String(p.alertName);
    if (
      !['SmartVolOpen', 'SmartVolAdd', 'SmartVolClose', 'VolumeUp'].includes(
        type,
      )
    )
      throw new BadRequestException(`Unknown type ${type}`);

    // Обрабатываем Volume Up отдельно
    if (type === 'VolumeUp') {
      if (p.volume == null)
        throw new BadRequestException('volume is required for VolumeUp alerts');
      if (!p.timeframe)
        throw new BadRequestException(
          'timeframe is required for VolumeUp alerts',
        );

      this.logger.log(
        `📊 Обрабатываю Volume Up для ${p.symbol} (${p.timeframe}): ${p.volume}`,
      );
      this.volumeUpService.saveVolumeUp(
        String(p.symbol),
        String(p.timeframe),
        Number(p.volume),
      );

      return { ok: true, message: 'Volume Up data saved' };
    }

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

  @Get('/volume-up/:symbol')
  async getVolumeUp(
    @Param('symbol') symbol: string,
    @Query('timeframe') timeframe: string,
  ) {
    if (!timeframe) {
      throw new BadRequestException('timeframe query parameter is required');
    }

    this.logger.log(`📊 Запрос Volume Up данных для ${symbol} (${timeframe})`);

    const data = this.volumeUpService.getVolumeUp(symbol, timeframe);
    if (!data) {
      return {
        ok: false,
        message: `No active Volume Up data for ${symbol} (${timeframe})`,
        data: null,
      };
    }

    return {
      ok: true,
      message: `Volume Up data found for ${symbol} (${timeframe})`,
      data,
    };
  }

  @Get('/volume-up/symbol/:symbol')
  async getVolumeUpBySymbol(@Param('symbol') symbol: string) {
    this.logger.log(`📊 Запрос Volume Up данных для символа ${symbol}`);

    const data = this.volumeUpService.getVolumeUpBySymbol(symbol);

    return {
      ok: true,
      message: `Found ${data.length} active Volume Up records for ${symbol}`,
      data,
      count: data.length,
    };
  }

  @Get('/volume-up/timeframe/:timeframe')
  async getVolumeUpByTimeframe(@Param('timeframe') timeframe: string) {
    this.logger.log(`📊 Запрос Volume Up данных для таймфрейма ${timeframe}`);

    const data = this.volumeUpService.getVolumeUpByTimeframe(timeframe);

    return {
      ok: true,
      message: `Found ${data.length} active Volume Up records for timeframe ${timeframe}`,
      data,
      count: data.length,
    };
  }

  @Get('/volume-up')
  async getAllVolumeUp() {
    this.logger.log(`📊 Запрос всех активных Volume Up данных`);

    const data = this.volumeUpService.getAllActiveVolumeUp();
    const stats = this.volumeUpService.getStats();

    return {
      ok: true,
      message: `Found ${data.length} active Volume Up records`,
      data,
      stats,
    };
  }

  @Post('/volume-up/clear')
  async clearVolumeUp() {
    this.logger.log(`🧹 Очистка всех Volume Up данных`);

    this.volumeUpService.clearAll();

    return {
      ok: true,
      message: 'All Volume Up data cleared',
    };
  }

  @Get('/volume-up/close-states')
  async getAllCloseStates() {
    this.logger.log(`📊 Запрос всех активных состояний закрытия Volume Up`);

    const data = this.volumeUpService.getAllCloseStates();

    return {
      ok: true,
      message: `Found ${data.length} active close states`,
      data,
      count: data.length,
    };
  }

  @Get('/volume-up/close-states/:symbol/:botName')
  async getCloseState(
    @Param('symbol') symbol: string,
    @Param('botName') botName: string,
  ) {
    this.logger.log(`📊 Запрос состояния закрытия для ${symbol} (${botName})`);

    const data = this.volumeUpService.getCloseState(symbol, botName);
    if (!data) {
      return {
        ok: false,
        message: `No active close state for ${symbol} (${botName})`,
        data: null,
      };
    }

    return {
      ok: true,
      message: `Close state found for ${symbol} (${botName})`,
      data,
    };
  }

  @Post('/volume-up/close-states/clear')
  async clearAllCloseStates() {
    this.logger.log(`🧹 Очистка всех состояний закрытия Volume Up`);

    // Очищаем все Volume Up данные (включая состояния закрытия)
    this.volumeUpService.clearAll();

    return {
      ok: true,
      message: 'All Volume Up data and close states cleared',
    };
  }
}
