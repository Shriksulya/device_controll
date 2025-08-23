import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotConfig, Strategy } from './interfaces';
import { BotEngine } from './bot-engine';
import { NoopExchange } from './adapters/exchange.noop';
import { BitgetExchangeGateway } from './adapters/exchange.bitget';
import { TelegramNotifier } from './adapters/notifier.telegram';
import { TrendServiceProvider } from './adapters/trend.provider';
import { TrendService } from '../trend/trend.service';
import { TelegramService } from '../services/telegram.service';
import { VolumeUpService } from '../services/volume-up.service';
import { PositionsStore } from './positions.store';
import { SmartVolDefaultStrategy } from './strategies/smartvol.default.strategy';
import { SmartVolPartialCloseStrategy } from './strategies/smartvol.partial-close.strategy';
import { SmartVolumeStrategy } from './strategies/smartvolume.strategy';
import { DominationStrategy } from './strategies/domination.strategy';
import { BitgetService } from '../integrations/bitget/bitget.service';

@Injectable()
export class BotsRegistry {
  private readonly log = new Logger(BotsRegistry.name);
  private bots = new Map<string, BotEngine>();

  constructor(
    private readonly cfg: ConfigService,
    private readonly trend: TrendService,
    private readonly telegram: TelegramService,
    private readonly volumeUp: VolumeUpService,
    private readonly positions: PositionsStore,
    private readonly bitget: BitgetService,
  ) {}

  all() {
    return [...this.bots.values()];
  }

  async initFromConfig() {
    this.log.log('🚀 Инициализация ботов из конфига...');
    const list = this.cfg.get<BotConfig[]>('bots') || [];
    this.log.log(`📋 Найдено ботов в конфиге: ${list.length}`);

    const trendProvider = new TrendServiceProvider(this.trend);

    for (const c of list) {
      this.log.log(`🔍 Проверяю бота: ${c.name} (enabled: ${c.enabled})`);

      if (!c.enabled) {
        this.log.log(`⏸️ Бот ${c.name} отключен, пропускаю`);
        continue;
      }

      // Проверяем конфигурацию в зависимости от стратегии
      if (c.strategy === 'domination') {
        // Для Domination стратегии проверяем только telegram
        this.log.log(`🎯 Бот ${c.name} использует Domination стратегию`);
      } else {
        // Для SmartVol стратегии проверяем smartvol конфигурацию
        if (!c.smartvol?.baseUsd || isNaN(c.smartvol.baseUsd)) {
          this.log.error(
            `❌ Ошибка конфигурации для бота ${c.name}: baseUsd не определен или не является числом`,
          );
          continue;
        }

        if (!c.smartvol?.addFraction || isNaN(c.smartvol.addFraction)) {
          this.log.error(
            `❌ Ошибка конфигурации для бота ${c.name}: addFraction не определен или не является числом`,
          );
          continue;
        }
      }

      // Проверяем конфигурацию телеграма
      if (!c.telegram_channel) {
        this.log.error(
          `❌ Ошибка конфигурации для бота ${c.name}: telegram_channel не определен`,
        );
        continue;
      }

      const telegramConfig = this.cfg.get(`telegram.${c.telegram_channel}`);
      if (!telegramConfig?.token || !telegramConfig?.chatId) {
        this.log.error(
          `❌ Ошибка конфигурации телеграма для бота ${c.name}: токен или chatId не определены`,
        );
        continue;
      }

      // Тестируем подключение к телеграму
      this.log.log(`🔍 Тестирую подключение к телеграму для бота ${c.name}...`);
      const telegramTest = await this.telegram.testConnection(
        c.telegram_channel,
      );
      if (!telegramTest) {
        this.log.error(
          `❌ Не удалось подключиться к телеграму для бота ${c.name}`,
        );
        continue;
      }
      this.log.log(`✅ Подключение к телеграму успешно для бота ${c.name}`);

      this.log.log(`⚙️ Создаю бота ${c.name} с профилем ${c.exchange_profile}`);

      const exchange = c.prod
        ? new BitgetExchangeGateway(this.bitget)
        : new NoopExchange();
      const notifier = new TelegramNotifier(this.telegram, c.telegram_channel);

      // Выбираем стратегию в зависимости от конфигурации
      let strategy: Strategy;
      if (c.strategy === 'domination') {
        strategy = new DominationStrategy(this.positions, this.telegram);
        this.log.log(`🎯 Бот ${c.name} использует Domination стратегию`);
      } else if (c.strategy === 'partial-close') {
        strategy = new SmartVolPartialCloseStrategy(
          this.positions,
          this.volumeUp,
        );
        this.log.log(
          `🔄 Бот ${c.name} использует SmartVol Partial Close стратегию`,
        );
      } else if (c.strategy === 'smartvolume') {
        strategy = new SmartVolumeStrategy(this.positions, this.volumeUp);
        this.log.log(`📊 Бот ${c.name} использует SmartVolume стратегию`);
      } else {
        strategy = new SmartVolDefaultStrategy(this.positions, this.volumeUp);
        this.log.log(`📊 Бот ${c.name} использует SmartVol стратегию`);
      }

      const engine = new BotEngine(
        c,
        exchange,
        notifier,
        trendProvider,
        strategy,
      );
      this.bots.set(c.name, engine);
      this.log.log(`✅ Бот зарегистрирован: ${c.name}`);
    }

    this.log.log(`🎯 Всего зарегистрировано ботов: ${this.bots.size}`);
  }
}
