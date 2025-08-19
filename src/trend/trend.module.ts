import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrendConfirmationEntity } from '../entities/trend-confirmation.entity';
import { TrendController } from './trend.controller';
import { TrendService } from './trend.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrendConfirmationEntity])],
  controllers: [TrendController],
  providers: [TrendService],
  exports: [TrendService],
})
export class TrendModule {}
