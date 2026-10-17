import { invoke } from '@tauri-apps/api/core';
import type { TerminalLinkReply, TerminalLinkRequest } from '../../../../../../shared/terminal/links';
import type { UdpListenerFactory } from '../../../../../../shared/port-mapping/udpTunnel';
import { UDP_PROTOCOL_VERSION } from '../../../../../../shared/port-mapping/datagrams';

export const listenUdp: UdpListenerFactory = async port => {
  const reply = await invoke<TerminalLinkReply>('codex_gui_terminal_link',
    { request: { type: 'udpListen', port, version: UDP_PROTOCOL_VERSION } });
  if (reply.type !== 'listener') throw new Error('无法监听本地端口，请换一个端口重试。');
  const id = reply.id;
  const request = (input: TerminalLinkRequest) => invoke<TerminalLinkReply>('codex_gui_terminal_link',
    { request: { ...input, scope: id } });
  return {
    read: async () => {
      const result = await request({ type: 'udpRead', id });
      if (result.type !== 'datagrams') throw new Error('Unexpected UDP response');
      return result.packets;
    },
    write: async packets => { await request({ type: 'udpWrite', id, packets }); },
    close: async () => { await request({ type: 'udpClose', id }); },
  };
};
