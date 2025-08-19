import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  TrendConfirmationEntity,
  TrendDirection,
} from '../entities/trend-confirmation.entity';
import { TrendConfirmationArgs, TrendAlertMeta } from './trend.types';

function tfMs(tf: string): number {
  const m = /^(\d+)([mhdw])$/i.exec(tf || '');
  if (!m) throw new BadRequestException(`Invalid timeframe "${tf}"`);
  const v = Number(m[1]),
    u = m[2].toLowerCase();
  return u === 'm'
    ? v * 60_000
    : u === 'h'
      ? v * 3_600_000
      : u === 'd'
        ? v * 86_400_000
        : v * 604_800_000;
}

@Injectable()
export class TrendService {
  constructor(
    @InjectRepository(TrendConfirmationEntity)
    private readonly repo: Repository<TrendConfirmationEntity>,
  ) {}

  async confirm(args: TrendConfirmationArgs) {
    const symbol = args.symbol.toUpperCase();
    const timeframe = args.timeframe.toLowerCase();
    const ttl = tfMs(timeframe) * 2;
    const now = Date.now();

    // Если есть название в meta, проверяем существующий алерт
    if (args.meta?.name) {
      const existingAlert = await this.repo.findOne({
        where: {
          symbol,
          meta: { name: args.meta.name },
        },
      });

      if (existingAlert) {
        // Обновляем существующий алерт
        existingAlert.direction = args.direction;
        existingAlert.timeframe = timeframe;
        existingAlert.createdAt = new Date(now);
        existingAlert.expiresAt = new Date(now + ttl);
        existingAlert.source = args.source;
        existingAlert.meta = args.meta;
        return this.repo.save(existingAlert);
      }
    }

    // Создаем новый алерт
    const row = this.repo.create({
      symbol,
      timeframe,
      direction: args.direction,
      createdAt: new Date(now),
      expiresAt: new Date(now + ttl),
      source: args.source,
      meta: args.meta ?? null,
    });
    return this.repo.save(row);
  }

  async getCurrentTrend(
    symbol: string,
    timeframe: string,
  ): Promise<'long' | 'short' | 'neutral'> {
    const rows = await this.repo.find({
      where: {
        symbol: symbol.toUpperCase(),
        timeframe: timeframe.toLowerCase(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' }, // Сортируем по времени создания
    });

    if (!rows.length) return 'neutral';

    const longCnt = rows.filter((r) => r.direction === 'long').length;
    const shortCnt = rows.length - longCnt;

    if (longCnt > shortCnt) return 'long';
    if (shortCnt > longCnt) return 'short';

    // Если равное количество, анализируем 3 последних подтверждения
    if (longCnt === shortCnt && rows.length >= 3) {
      const lastThree = rows.slice(0, 3);
      const lastLongCnt = lastThree.filter(
        (r) => r.direction === 'long',
      ).length;
      const lastShortCnt = lastThree.length - lastLongCnt;

      if (lastLongCnt > lastShortCnt) return 'long';
      if (lastShortCnt > lastLongCnt) return 'short';
    }

    return 'neutral';
  }

  async agreeAll(
    symbol: string,
    timeframes: string[],
  ): Promise<'long' | 'short' | 'neutral'> {
    if (!timeframes?.length) return 'neutral';
    const vals = await Promise.all(
      timeframes.map((tf) => this.getCurrentTrend(symbol, tf)),
    );
    const set = new Set(vals);
    if (set.size === 1 && set.has('long')) return 'long';
    if (set.size === 1 && set.has('short')) return 'short';
    return 'neutral';
  }

  /**
   * Проверяет тренд с учетом иерархии таймфреймов
   * Главный таймфрейм имеет приоритет над остальными
   * @param symbol символ
   * @param timeframes массив таймфреймов (первый - главный)
   * @returns направление тренда
   */
  async agreeAllWithHierarchy(
    symbol: string,
    timeframes: string[],
  ): Promise<'long' | 'short' | 'neutral'> {
    if (!timeframes?.length) return 'neutral';

    // Сортируем таймфреймы по приоритету (от высшего к низшему)
    const sortedTimeframes = timeframes.sort((a, b) => {
      const priorityA = this.getTimeframePriority(a);
      const priorityB = this.getTimeframePriority(b);
      return priorityB - priorityA;
    });

    // Получаем тренд для главного таймфрейма
    const mainTimeframe = sortedTimeframes[0];
    const mainTrend = await this.getCurrentTrend(symbol, mainTimeframe);

    // Если главный тренд нейтральный, возвращаем нейтральный
    if (mainTrend === 'neutral') return 'neutral';

    // Проверяем, совпадают ли все остальные таймфреймы с главным
    const otherTimeframes = sortedTimeframes.slice(1);
    if (otherTimeframes.length === 0) return mainTrend;

    const otherTrends = await Promise.all(
      otherTimeframes.map((tf) => this.getCurrentTrend(symbol, tf)),
    );

    // Если хотя бы один из остальных таймфреймов не совпадает с главным,
    // возвращаем нейтральный (не докупаем, но и не закрываем)
    const allAgree = otherTrends.every(
      (trend) => trend === mainTrend || trend === 'neutral',
    );

    if (allAgree) {
      return mainTrend;
    } else {
      return 'neutral';
    }
  }

  /**
   * Проверяет, можно ли докупать позицию (тренд совпадает по всем таймфреймам)
   * @param symbol символ
   * @param timeframes массив таймфреймов
   * @returns true если можно докупать
   */
  async canAddPosition(
    symbol: string,
    timeframes: string[],
    expectedDirection: 'long' | 'short',
  ): Promise<boolean> {
    if (!timeframes?.length) return false;

    const sortedTimeframes = timeframes.sort((a, b) => {
      const priorityA = this.getTimeframePriority(a);
      const priorityB = this.getTimeframePriority(b);
      return priorityB - priorityA;
    });

    // Для докупки все таймфреймы должны совпадать
    const trends = await Promise.all(
      sortedTimeframes.map((tf) => this.getCurrentTrend(symbol, tf)),
    );

    return trends.every((trend) => trend === expectedDirection);
  }

  /**
   * Проверяет, нужно ли закрывать позицию (главный тренд развернулся)
   * @param symbol символ
   * @param timeframes массив таймфреймов
   * @param currentDirection текущее направление позиции
   * @returns true если нужно закрывать
   */
  async shouldClosePosition(
    symbol: string,
    timeframes: string[],
    currentDirection: 'long' | 'short',
  ): Promise<boolean> {
    if (!timeframes?.length) return false;

    const sortedTimeframes = timeframes.sort((a, b) => {
      const priorityA = this.getTimeframePriority(a);
      const priorityB = this.getTimeframePriority(b);
      return priorityB - priorityA;
    });

    // Проверяем главный таймфрейм
    const mainTimeframe = sortedTimeframes[0];
    const mainTrend = await this.getCurrentTrend(symbol, mainTimeframe);

    // Закрываем только если главный тренд развернулся
    return mainTrend !== 'neutral' && mainTrend !== currentDirection;
  }

  /**
   * Вспомогательный метод для определения приоритета таймфрейма
   */
  private getTimeframePriority(timeframe: string): number {
    const match = /^(\d+)([mhdw])$/i.exec(timeframe);
    if (!match) return 0;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
      m: 1, // минуты
      h: 60, // часы (60 минут)
      d: 1440, // дни (24 * 60 минут)
      w: 10080, // недели (7 * 24 * 60 минут)
    };

    return value * multipliers[unit];
  }
}
