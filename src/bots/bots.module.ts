// src/bots/bots.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import botsConfig from '../config/bots.config';
import { AlertsController } from '../alerts/alerts.controller';
import { AlertsRouter } from '../bot-core/alerts.router';
import { BotsRegistry } from '../bot-core/bots.registry';
import { BotsScheduler } from '../bot-core/scheduler.service';
import { SchedulerController } from '../bot-core/scheduler.controller';
import { TrendModule } from '../trend/trend.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [botsConfig] }),
    TrendModule,
  ],
  controllers: [AlertsController, SchedulerController],
  providers: [AlertsRouter, BotsRegistry, BotsScheduler],
  exports: [],
})
export class BotsModule implements OnModuleInit {
  constructor(
    private readonly reg: BotsRegistry,
    private readonly sch: BotsScheduler,
  ) {}
  onModuleInit() {
    this.reg.initFromConfig();
    this.sch.start();
  }
}
