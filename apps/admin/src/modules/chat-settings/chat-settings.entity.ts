import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { ChatPolicy } from './chat-policy';

@Entity({ name: 'chat_settings' })
export class ChatSettingsEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ type: 'jsonb' })
  policy: ChatPolicy;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
