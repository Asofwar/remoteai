import { Controller, Get, Header } from '@nestjs/common';
import { ChatSettingsService } from './chat-settings.service';

/** Only non-sensitive model preferences are exposed to desktop clients. */
@Controller('chat/title-settings')
export class TitleSettingsController {
  constructor(private readonly settings: ChatSettingsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async read() { return (await this.settings.read()).titleSettings; }
}
