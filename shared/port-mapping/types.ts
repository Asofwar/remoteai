import type { ForwardingClient } from './service';

export interface MappingTunnel {
  resolve: (resource: string, url: string) => Promise<string>;
  close: () => Promise<void>;
}
export interface MappingTunnelOptions {
  localPort: number;
  onClosed: () => void;
  bridgeBudget: { active: number; limit: number };
}
export type TunnelFactory = (client: ForwardingClient, options: MappingTunnelOptions) => MappingTunnel;
