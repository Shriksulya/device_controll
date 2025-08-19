import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { BotsRegistry } from './bots.registry';
import { Alert, SmartVolType } from './interfaces';

function toAlert(p: any): Alert {
  if (!p || typeof p !== 'object')
    throw new BadRequestException('Invalid payload');
  if (!('alertName' in p))
    throw new BadRequestException('Only SmartVol alerts are supported');
  const type = String(p.alertName) as SmartVolType;
  if (!['SmartVolOpen', 'SmartVolAdd', 'SmartVolClose'].includes(type)) {
    throw new BadRequestException(`Unknown SmartVol type: ${type}`);
  }
  if (!p.symbol || p.price == null)
    throw new BadRequestException('symbol and price are required');
  return {
    kind: 'smartvol',
    type,
    symbol: String(p.symbol),
    price: String(p.price),
    timeframe: p.timeframe,
  };
}

@Injectable()
export class AlertsRouter {
  private readonly log = new Logger(AlertsRouter.name);
  constructor(private readonly registry: BotsRegistry) {}

  async handle(payload: any) {
    const alert = toAlert(payload);
    for (const bot of this.registry.all()) {
      const filter = bot.cfg.symbol_filter || [];
      if (filter.length && !filter.includes(alert.symbol)) continue;
      try {
        await bot.process(alert);
      } catch (e: any) {
        this.log.warn(`${bot.name} failed: ${e.message}`);
      }
    }
  }
}
