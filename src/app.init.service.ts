import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BotsRegistry } from './bot-core/bots.registry';

@Injectable()
export class AppInitService implements OnModuleInit {
  private readonly logger = new Logger(AppInitService.name);

  constructor(private readonly botsRegistry: BotsRegistry) {}

  async onModuleInit() {
    this.logger.log('🚀 Инициализация приложения...');

    try {
      // Инициализируем ботов из конфига
      this.botsRegistry.initFromConfig();
      this.logger.log('✅ Боты инициализированы успешно');
    } catch (error) {
      this.logger.error('❌ Ошибка при инициализации ботов:', error);
    }
  }
}
