import { Global, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BitgetService } from './bitget.service';

export const BITGET_REGISTRY = Symbol('BITGET_REGISTRY');
export type BitgetRegistry = {
  byProfile: Map<string, BitgetService>;
  byBot: Map<string, BitgetService>;
  getByProfile(profile: string): BitgetService | undefined;
  getByBot(botName: string): BitgetService | undefined;
};

function makeRegistry(cfg: ConfigService): BitgetRegistry {
  // 1) Создаём инстансы по ВСЕМ профилям, что есть в конфиге
  const profiles = Object.keys(cfg.get('bitget') || {});
  const byProfile = new Map<string, BitgetService>();
  for (const p of profiles) {
    byProfile.set(p, new BitgetService(cfg, p as any));
  }

  // 2) Мапим ботов -> профиль
  const bots = (cfg.get<any[]>('bots') || []).filter(
    (b) => b && b.enabled !== false,
  );
  const byBot = new Map<string, BitgetService>();
  for (const b of bots) {
    const prof = String(b.exchange_profile || 'BITGET');
    const svc = byProfile.get(prof) ?? new BitgetService(cfg, prof as any);
    byBot.set(String(b.name), svc);
  }

  return {
    byProfile,
    byBot,
    getByProfile: (profile: string) => byProfile.get(profile),
    getByBot: (botName: string) => byBot.get(botName),
  };
}

const RegistryProvider: Provider = {
  provide: BITGET_REGISTRY,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => makeRegistry(cfg),
};

const DefaultBitgetProvider: Provider = {
  provide: BitgetService,
  inject: [BITGET_REGISTRY, ConfigService],
  useFactory: (reg: BitgetRegistry, cfg: ConfigService) => {
    // дефолт = первый включенный бот
    const bots = (cfg.get<any[]>('bots') || []).filter(
      (b) => b && b.enabled !== false,
    );
    const first = bots[0];
    if (first) {
      const svc = reg.getByBot(String(first.name));
      if (svc) return svc;
    }
    // fallback: профиль BITGET
    return reg.getByProfile('BITGET') ?? new BitgetService(cfg, 'BITGET');
  },
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RegistryProvider, DefaultBitgetProvider],
  exports: [BITGET_REGISTRY, BitgetService],
})
export class IntegrationsModule {}
