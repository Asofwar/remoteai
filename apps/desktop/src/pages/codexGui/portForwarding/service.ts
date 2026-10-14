import { PortForwardingService as SharedService } from '../../../../../../shared/port-mapping/service';
import { TerminalLinkTunnels } from '../terminal/linkTunnel';
import type { ForwardingClient } from '../../../../../../shared/port-mapping/service';
import type { PortMapping } from './settings';
export type { ForwardingClient, ForwardingEntry } from '../../../../../../shared/port-mapping/service';

export class PortForwardingService extends SharedService {
  constructor(client: ForwardingClient, saved: PortMapping[] = []) {
    super(client, saved, { createId: () => crypto.randomUUID(),
      createTunnel: (connection, options) => new TerminalLinkTunnels(connection, undefined, options) });
  }
}
