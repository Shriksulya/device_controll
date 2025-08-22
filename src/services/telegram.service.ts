// src/services/telegram.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type BotType = 'bot1' | 'bot2' | 'bot3' | 'bot4' | 'domination';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMessage(text: string, botType: BotType): Promise<void> {
    this.logger.log(
      `📤 Отправляю сообщение в телеграм через ${botType}: ${text.substring(0, 100)}...`,
    );

    const botConfig = this.configService.get(`telegram.${botType}`);
    if (!botConfig?.token || !botConfig?.chatId) {
      this.logger.warn(`${botType} token or chatId is not configured`);
      return;
    }

    // Проверяем формат токена и chatId
    if (!botConfig.token.includes(':')) {
      this.logger.error(
        `❌ Неверный формат токена для ${botType}: должен содержать ':'`,
      );
      return;
    }

    if (
      !botConfig.chatId.startsWith('-') &&
      !botConfig.chatId.startsWith('@')
    ) {
      this.logger.error(
        `❌ Неверный формат chatId для ${botType}: должен начинаться с '-' или '@'`,
      );
      return;
    }

    this.logger.log(
      `🔧 Конфигурация телеграма для ${botType}: токен=${botConfig.token.substring(0, 10)}..., chatId=${botConfig.chatId}`,
    );

    const url = `https://api.telegram.org/bot${botConfig.token}/sendMessage`;
    try {
      const response = await axios.post(url, {
        chat_id: botConfig.chatId,
        text,
        parse_mode: 'HTML',
      });
      this.logger.log(
        `✅ Telegram сообщение успешно отправлено через ${botType} (${botConfig.name}) - статус: ${response.status}`,
      );
    } catch (error) {
      // Логируем только важную информацию об ошибке
      if (error.response) {
        // Ошибка от сервера
        this.logger.error(
          `❌ Telegram ошибка для ${botType}: ${error.response.status} - ${error.response.data?.description || error.response.statusText}`,
        );
      } else if (error.request) {
        // Ошибка сети
        this.logger.error(`❌ Сетевая ошибка для ${botType}: ${error.message}`);
      } else {
        // Другая ошибка
        this.logger.error(`❌ Ошибка для ${botType}: ${error.message}`);
      }
      throw error;
    }
  }

  // Метод для тестирования подключения к телеграму
  async testConnection(botType: BotType): Promise<boolean> {
    try {
      const botConfig = this.configService.get(`telegram.${botType}`);
      if (!botConfig?.token || !botConfig?.chatId) {
        this.logger.warn(`${botType} token or chatId is not configured`);
        return false;
      }

      const url = `https://api.telegram.org/bot${botConfig.token}/getMe`;
      const response = await axios.get(url);

      if (response.data?.ok) {
        this.logger.log(
          `✅ Тест подключения к телеграму успешен для ${botType}: ${response.data.result.username}`,
        );
        return true;
      } else {
        this.logger.error(
          `❌ Тест подключения к телеграму неудачен для ${botType}: ${response.data?.description || 'Unknown error'}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `❌ Ошибка тестирования подключения к телеграму для ${botType}: ${error.message}`,
      );
      return false;
    }
  }
}
