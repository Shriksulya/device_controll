import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

export interface VolumeUpData {
  symbol: string;
  timeframe: string;
  volume: number;
  timestamp: Date;
}

export interface VolumeUpCloseState {
  symbol: string;
  botName: string;
  initialVolume: number;
  currentVolume: number;
  timestamp: Date;
  waitingForClose: boolean;
}

@Injectable()
export class VolumeUpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VolumeUpService.name);
  private volumeData = new Map<string, VolumeUpData>();
  private closeStates = new Map<string, VolumeUpCloseState>();
  private cleanupInterval: NodeJS.Timeout;

  onModuleInit() {
    // Запускаем очистку каждую минуту
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredData();
    }, 60000); // 60 секунд
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Создает уникальный ключ для символа + таймфрейма
   */
  private getKey(symbol: string, timeframe: string): string {
    return `${symbol}_${timeframe}`;
  }

  /**
   * Создает уникальный ключ для состояния закрытия
   */
  private getCloseStateKey(symbol: string, botName: string): string {
    return `${symbol}_${botName}`;
  }

  /**
   * Сохраняет Volume Up данные для символа и таймфрейма
   */
  saveVolumeUp(symbol: string, timeframe: string, volume: number): void {
    const key = this.getKey(symbol, timeframe);
    this.logger.log(
      `💾 Сохраняю Volume Up для ${symbol} (${timeframe}): ${volume}`,
    );

    this.volumeData.set(key, {
      symbol,
      timeframe,
      volume,
      timestamp: new Date(),
    });

    // Обновляем состояние закрытия, если оно существует
    this.updateCloseState(symbol, volume);
  }

  /**
   * Инициализирует состояние ожидания закрытия при первом SmartVolClose
   */
  initCloseState(symbol: string, botName: string, initialVolume: number): void {
    const key = this.getCloseStateKey(symbol, botName);
    this.logger.log(
      `🚀 Инициализирую состояние закрытия для ${symbol} (${botName}) с VolumeUp: ${initialVolume}`,
    );

    this.closeStates.set(key, {
      symbol,
      botName,
      initialVolume,
      currentVolume: initialVolume,
      timestamp: new Date(),
      waitingForClose: true,
    });
  }

  /**
   * Обновляет состояние закрытия при получении нового VolumeUp
   */
  private updateCloseState(symbol: string, newVolume: number): void {
    for (const [key, state] of this.closeStates.entries()) {
      if (state.symbol === symbol && state.waitingForClose) {
        this.logger.log(
          `📈 Обновляю VolumeUp для ${symbol} (${state.botName}): ${state.currentVolume} → ${newVolume}`,
        );

        state.currentVolume = newVolume;
        state.timestamp = new Date(); // Обновляем время последнего VolumeUp

        // Если VolumeUp >= 19, помечаем что можно закрывать
        if (newVolume >= 19) {
          this.logger.log(
            `✅ VolumeUp ${newVolume} >= 19 для ${symbol} (${state.botName}) - можно закрывать!`,
          );
        }
      }
    }
  }

  /**
   * Проверяет, можно ли закрывать позицию
   */
  canClosePosition(symbol: string, botName: string): boolean {
    const key = this.getCloseStateKey(symbol, botName);
    const state = this.closeStates.get(key);

    if (!state || !state.waitingForClose) {
      return false;
    }

    // Проверяем, не устарели ли данные (больше 2 минут)
    const now = new Date();
    const diffMs = now.getTime() - state.timestamp.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes > 2) {
      this.logger.log(
        `⏰ Состояние закрытия для ${symbol} (${botName}) устарело (${diffMinutes.toFixed(1)} мин), очищаю`,
      );
      this.closeStates.delete(key);
      return false;
    }

    // Можно закрывать если VolumeUp >= 19
    return state.currentVolume >= 19;
  }

  /**
   * Получает текущее состояние закрытия
   */
  getCloseState(symbol: string, botName: string): VolumeUpCloseState | null {
    const key = this.getCloseStateKey(symbol, botName);
    const state = this.closeStates.get(key);

    if (!state || !state.waitingForClose) {
      return null;
    }

    // Проверяем актуальность
    const now = new Date();
    const diffMs = now.getTime() - state.timestamp.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes > 2) {
      this.logger.log(
        `⏰ Состояние закрытия для ${symbol} (${botName}) устарело (${diffMinutes.toFixed(1)} мин), очищаю`,
      );
      this.closeStates.delete(key);
      return null;
    }

    return state;
  }

  /**
   * Помечает позицию как закрытую
   */
  markPositionClosed(symbol: string, botName: string): void {
    const key = this.getCloseStateKey(symbol, botName);
    const state = this.closeStates.get(key);

    if (state) {
      this.logger.log(
        `✅ Позиция ${symbol} (${botName}) закрыта, очищаю состояние`,
      );
      this.closeStates.delete(key);
    }
  }

  /**
   * Получает Volume Up данные для символа и таймфрейма
   */
  getVolumeUp(symbol: string, timeframe: string): VolumeUpData | null {
    const key = this.getKey(symbol, timeframe);
    const data = this.volumeData.get(key);
    if (!data) return null;

    // Проверяем, не устарели ли данные (больше 2 минут)
    const now = new Date();
    const diffMs = now.getTime() - data.timestamp.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes > 2) {
      this.logger.log(
        `⏰ Volume Up данные для ${symbol} (${timeframe}) устарели (${diffMinutes.toFixed(1)} мин), очищаю`,
      );
      this.volumeData.delete(key);
      return null;
    }

    return data;
  }

  /**
   * Получает Volume Up данные для символа по всем таймфреймам
   */
  getVolumeUpBySymbol(symbol: string): VolumeUpData[] {
    const now = new Date();
    const symbolData: VolumeUpData[] = [];

    for (const [key, data] of this.volumeData.entries()) {
      if (data.symbol === symbol) {
        const diffMs = now.getTime() - data.timestamp.getTime();
        const diffMinutes = diffMs / (1000 * 60);

        if (diffMinutes <= 2) {
          symbolData.push(data);
        } else {
          this.logger.log(
            `⏰ Очищаю устаревшие Volume Up данные для ${symbol} (${data.timeframe}) (${diffMinutes.toFixed(1)} мин)`,
          );
          this.volumeData.delete(key);
        }
      }
    }

    return symbolData;
  }

  /**
   * Получает все активные Volume Up данные
   */
  getAllActiveVolumeUp(): VolumeUpData[] {
    const now = new Date();
    const activeData: VolumeUpData[] = [];

    for (const [key, data] of this.volumeData.entries()) {
      const diffMs = now.getTime() - data.timestamp.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes <= 2) {
        activeData.push(data);
      } else {
        this.logger.log(
          `⏰ Очищаю устаревшие Volume Up данные для ${data.symbol} (${data.timeframe}) (${diffMinutes.toFixed(1)} мин)`,
        );
        this.volumeData.delete(key);
      }
    }

    return activeData;
  }

  /**
   * Получает Volume Up данные по таймфрейму
   */
  getVolumeUpByTimeframe(timeframe: string): VolumeUpData[] {
    const now = new Date();
    const timeframeData: VolumeUpData[] = [];

    for (const [key, data] of this.volumeData.entries()) {
      if (data.timeframe === timeframe) {
        const diffMs = now.getTime() - data.timestamp.getTime();
        const diffMinutes = diffMs / (1000 * 60);

        if (diffMinutes <= 2) {
          timeframeData.push(data);
        } else {
          this.logger.log(
            `⏰ Очищаю устаревшие Volume Up данные для ${data.symbol} (${timeframe}) (${diffMinutes.toFixed(1)} мин)`,
          );
          this.volumeData.delete(key);
        }
      }
    }

    return timeframeData;
  }

  /**
   * Получает все активные состояния закрытия
   */
  getAllCloseStates(): VolumeUpCloseState[] {
    const now = new Date();
    const activeStates: VolumeUpCloseState[] = [];

    for (const [key, state] of this.closeStates.entries()) {
      const diffMs = now.getTime() - state.timestamp.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes <= 2) {
        activeStates.push(state);
      } else {
        this.logger.log(
          `⏰ Очищаю устаревшее состояние закрытия для ${state.symbol} (${state.botName}) (${diffMinutes.toFixed(1)} мин)`,
        );
        this.closeStates.delete(key);
      }
    }

    return activeStates;
  }

  /**
   * Очищает все Volume Up данные
   */
  clearAll(): void {
    this.logger.log('🧹 Очищаю все Volume Up данные');
    this.volumeData.clear();
    this.closeStates.clear();
  }

  /**
   * Очищает Volume Up данные для конкретного символа
   */
  clearBySymbol(symbol: string): void {
    this.logger.log(`🧹 Очищаю Volume Up данные для ${symbol}`);
    for (const [key, data] of this.volumeData.entries()) {
      if (data.symbol === symbol) {
        this.volumeData.delete(key);
      }
    }

    // Очищаем состояния закрытия для этого символа
    for (const [key, state] of this.closeStates.entries()) {
      if (state.symbol === symbol) {
        this.closeStates.delete(key);
      }
    }
  }

  /**
   * Очищает Volume Up данные для конкретного таймфрейма
   */
  clearByTimeframe(timeframe: string): void {
    this.logger.log(`🧹 Очищаю Volume Up данные для таймфрейма ${timeframe}`);
    for (const [key, data] of this.volumeData.entries()) {
      if (data.timeframe === timeframe) {
        this.volumeData.delete(key);
      }
    }
  }

  /**
   * Получает статистику по Volume Up данным
   */
  getStats(): {
    total: number;
    active: number;
    symbols: number;
    timeframes: number;
    closeStates: number;
  } {
    const active = this.getAllActiveVolumeUp();
    const symbols = new Set(active.map((d) => d.symbol)).size;
    const timeframes = new Set(active.map((d) => d.timeframe)).size;
    const closeStates = this.getAllCloseStates().length;

    return {
      total: this.volumeData.size,
      active: active.length,
      symbols,
      timeframes,
      closeStates,
    };
  }

  /**
   * Очистка устаревших данных
   */
  private cleanupExpiredData(): void {
    this.logger.debug('🧹 Запускаю очистку устаревших Volume Up данных');
    this.getAllActiveVolumeUp(); // Это автоматически очистит устаревшие данные
    this.getAllCloseStates(); // Это автоматически очистит устаревшие состояния
  }
}
