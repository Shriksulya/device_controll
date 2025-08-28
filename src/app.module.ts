// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import botsConfig from './config/bots.config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PositionEntity } from './entities/position.entity';
import { TrendConfirmationEntity } from './entities/trend-confirmation.entity';
import { TrendModule } from './trend/trend.module';
import { AlertsController } from './alerts/alerts.controller';
import { BotsRegistry } from './bot-core/bots.registry';
import { TrendService } from './trend/trend.service';
import { TelegramService } from './services/telegram.service';
import { VolumeUpService } from './services/volume-up.service';
import { PositionsStore } from './bot-core/positions.store';
import { IntegrationsModule } from './integrations/bitget/integrations.module';
import { AppInitService } from './app.init.service';
import { DominationStrategy } from './bot-core/strategies/domination.strategy';
import { TrendPivotStrategy } from './bot-core/strategies/trend-pivot.strategy';
import { AlertsRouter } from './bot-core/alerts.router';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [botsConfig] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'postgres',
        database: 'autosmartvol',
        entities: [PositionEntity, TrendConfirmationEntity],
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature([PositionEntity, TrendConfirmationEntity]),
    TrendModule,
    IntegrationsModule,
  ],
  controllers: [AlertsController],
  providers: [
    BotsRegistry,
    TrendService,
    TelegramService,
    VolumeUpService,
    PositionsStore,
    AppInitService,
    DominationStrategy,
    {
      provide: TrendPivotStrategy,
      useFactory: (
        trendRepo: Repository<TrendConfirmationEntity>,
        positions: PositionsStore,
      ) => {
        return new TrendPivotStrategy(trendRepo, positions);
      },
      inject: [getRepositoryToken(TrendConfirmationEntity), PositionsStore],
    },
    AlertsRouter,
  ],
})
export class AppModule {}
