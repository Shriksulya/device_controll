import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PositionStatus = 'open' | 'closed';

@Entity('positions')
@Index(['botName', 'symbol', 'status'])
export class PositionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  botName: string;

  @Column({ type: 'varchar', length: 64 })
  symbol: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: PositionStatus;

  @Column({ type: 'numeric', precision: 32, scale: 12 })
  avgEntryPrice: string;

  @Column({ type: 'numeric', precision: 32, scale: 12 })
  amountUsd: string;

  @Column({ type: 'int', default: 1 })
  fillsCount: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  openedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: any | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
