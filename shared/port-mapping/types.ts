import type { ForwardingClient } from './service';
import type { StreamBudget } from './streamBudget';

export interface MappingTunnel {
  resolve: (resource: string, url: string) => Promise<string>;
  close: () => Promise<void>;
}
export interface MappingTunnelOptions {
  localPort: number;
  onClosed: () => void;
  bridgeBudget: StreamBudget;
}
export type TunnelFactory = (client: ForwardingClient, options: MappingTunnelOptions) => MappingTunnel;
