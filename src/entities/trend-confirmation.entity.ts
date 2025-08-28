import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

export type TrendDirection = 'long' | 'short';

@Entity('trend_confirmations')
@Index(['symbol', 'timeframe'])
@Index(['symbol', 'timeframe'])
@Index(['symbol', 'meta'], { unique: true, where: "meta->>'name' IS NOT NULL" })
export class TrendConfirmationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  symbol: string; // BTCUSDT

  @Column({ type: 'varchar', length: 8 })
  timeframe: string; // '1m','1h',...

  @Column({ type: 'varchar', length: 8 })
  direction: TrendDirection; // long | short

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt?: Date; // TTL = 2×tf

  @Column({ type: 'varchar', length: 64, nullable: true })
  source?: string;

  @Column({ type: 'jsonb', nullable: true })
  meta?: any;
}
