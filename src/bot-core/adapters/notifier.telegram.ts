import { Notifier } from '../interfaces';
import { TelegramService } from '../../services/telegram.service';

export class TelegramNotifier implements Notifier {
  constructor(
    private readonly tg: TelegramService,
    private readonly channel: 'bot1' | 'bot2' | 'bot3' | 'bot4' | 'domination',
  ) {}

  async send(text: string) {
    try {
      await this.tg.sendMessage(text, this.channel);
    } catch (error) {
      console.error(
        `❌ Ошибка отправки уведомления в телеграм через ${this.channel}:`,
        error,
      );
      // Не бросаем ошибку дальше, чтобы не прерывать работу бота
    }
  }
}
