import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSettingsEntity } from './chat-settings.entity';
import { ChatSettingsService } from './chat-settings.service';
import { ChatSettingsController } from './chat-settings.controller';
import { TitleSettingsController } from './title-settings.controller';

@Module({ imports: [TypeOrmModule.forFeature([ChatSettingsEntity])],
  controllers: [ChatSettingsController, TitleSettingsController],
  providers: [ChatSettingsService], exports: [ChatSettingsService] })
export class ChatSettingsModule {}
