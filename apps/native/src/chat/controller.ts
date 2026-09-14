import type { AuthSession } from '../types';
import { ChatController as SharedController } from '../../../../shared/remote-chat/client/controller';
import { MobileChatConnection } from './connection';
import { SqliteHistoryStore } from './offline/store';

export class ChatController extends SharedController {
  constructor(session: AuthSession, deviceId: string) {
    super((events) => new MobileChatConnection({ session, deviceId, ...events }),
      new SqliteHistoryStore(session, deviceId));
  }
}
