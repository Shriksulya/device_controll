// src/bot-core/positions.store.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PositionEntity } from '../entities/position.entity';

@Injectable()
export class PositionsStore {
  constructor(
    @InjectRepository(PositionEntity)
    private readonly repo: Repository<PositionEntity>,
  ) {}

  async findOpen(botName: string, symbol: string) {
    return this.repo.findOne({ where: { botName, symbol, status: 'open' } });
  }

  async open(
    botName: string,
    symbol: string,
    price: string,
    amountUsd: string,
  ) {
    const p = this.repo.create({
      botName,
      symbol,
      status: 'open',
      avgEntryPrice: price,
      amountUsd,
      fillsCount: 1,
      openedAt: new Date(),
    });
    return this.repo.save(p);
  }

  async add(p: PositionEntity, addPrice: string, addUsd: string) {
    const currAmt = parseFloat(p.amountUsd);
    const currAvg = parseFloat(p.avgEntryPrice);
    const addAmt = parseFloat(addUsd);
    const addPr = parseFloat(addPrice);
    const totalCost = currAmt * currAvg + addAmt * addPr;
    const totalAmt = currAmt + addAmt;
    p.avgEntryPrice = (totalCost / totalAmt).toString();
    p.amountUsd = totalAmt.toString();
    p.fillsCount += 1;
    return this.repo.save(p);
  }

  async close(p: PositionEntity, closePrice: string) {
    p.status = 'closed';
    p.closedAt = new Date();
    return this.repo.save(p);
  }

  // Расчет PnL для открытой позиции
  calculatePnL(position: PositionEntity, currentPrice: number) {
    const avgPrice = parseFloat(position.avgEntryPrice);
    const amountUsd = parseFloat(position.amountUsd);
    const totalSize = amountUsd / avgPrice; // Размер позиции в токенах

    const currentValue = totalSize * currentPrice;
    const pnl = currentValue - amountUsd;
    const pnlPercent = (pnl / amountUsd) * 100;

    return {
      totalSize: totalSize.toFixed(8),
      currentValue: currentValue.toFixed(2),
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPercent.toFixed(2),
      avgEntryPrice: avgPrice,
      currentPrice: currentPrice,
    };
  }

  // Полная информация о позиции с PnL
  getPositionInfo(position: PositionEntity, currentPrice?: number) {
    const info = {
      id: position.id,
      botName: position.botName,
      symbol: position.symbol,
      status: position.status,
      avgEntryPrice: position.avgEntryPrice,
      amountUsd: position.amountUsd,
      fillsCount: position.fillsCount,
      openedAt: position.openedAt,
      closedAt: position.closedAt,
      duration: position.openedAt
        ? this.calculateDuration(position.openedAt)
        : null,
    };

    if (currentPrice && position.status === 'open') {
      const pnl = this.calculatePnL(position, currentPrice);
      return { ...info, pnl } as typeof info & {
        pnl: ReturnType<typeof this.calculatePnL>;
      };
    }

    return info as typeof info & { pnl: undefined };
  }

  private calculateDuration(openedAt: Date): string {
    const now = new Date();
    const diff = now.getTime() - openedAt.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }
    return `${minutes}м`;
  }

  // Получить сводку по всем открытым позициям бота
  async getBotSummary(botName: string, currentPrices: Record<string, number>) {
    const openPositions = await this.repo.find({
      where: { botName, status: 'open' },
    });

    let totalInvested = 0;
    let totalCurrentValue = 0;
    let totalPnL = 0;
    const positions: Array<{
      symbol: string;
      amountUsd: string;
      avgEntryPrice: string;
      currentPrice: number;
      pnl: string;
      pnlPercent: string;
      duration: string | null;
    }> = [];

    for (const pos of openPositions) {
      const currentPrice =
        currentPrices[pos.symbol] || parseFloat(pos.avgEntryPrice);
      const pnl = this.calculatePnL(pos, currentPrice);

      totalInvested += parseFloat(pos.amountUsd);
      totalCurrentValue += parseFloat(pnl.currentValue);
      totalPnL += parseFloat(pnl.pnl);

      positions.push({
        symbol: pos.symbol,
        amountUsd: pos.amountUsd,
        avgEntryPrice: pos.avgEntryPrice,
        currentPrice: currentPrice,
        pnl: pnl.pnl,
        pnlPercent: pnl.pnlPercent,
        duration: pos.openedAt ? this.calculateDuration(pos.openedAt) : null,
      });
    }

    const totalPnLPercent =
      totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return {
      botName,
      totalPositions: positions.length,
      totalInvested: totalInvested.toFixed(2),
      totalCurrentValue: totalCurrentValue.toFixed(2),
      totalPnL: totalPnL.toFixed(2),
      totalPnLPercent: totalPnLPercent.toFixed(2),
      positions,
    };
  }
}
