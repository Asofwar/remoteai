import { ChatConnection } from '../../../shared/remote-chat/client/connection';
import { ChatLink } from '../../../shared/remote-chat/link';
import { keyPair } from '../../../shared/remote-chat/cipher';
import { RtcPeer } from '../../../shared/remote-chat/rtcPeer';
import type { PeerOptions, RpcMessage, Signal } from '../../../shared/remote-chat/protocol';

const query = new URLSearchParams(location.search);
const desktop = query.get('role') === 'desktop';
const endpoint = query.get('socket')!;
const keys = keyPair((size) => crypto.getRandomValues(new Uint8Array(size)));
const events: unknown[] = [];
const errors: string[] = [];
const modes: string[] = [];
const rtc = new Set<RTCPeerConnection>();
let blocked = false;
let beats = 0;
let readyCount = 0;
let executions = 0;
let link: ChatLink | undefined;
let resume: { sessionId: string; resumeToken: string } | undefined;
let socket: WebSocket | undefined;
let pcReconnect: ReturnType<typeof setTimeout> | undefined;
setInterval(() => { beats += 1; }, 20);

function mode(value: string) { modes.push(value); document.querySelector('#status')!.textContent = value; }
function createPeer(options: PeerOptions) {
  if (blocked) throw new Error('Test network unavailable');
  return new RtcPeer(options, () => {
    const peer = new RTCPeerConnection({ iceServers: options.iceServers });
    rtc.add(peer);
    return peer;
  });
}

const phone = new ChatConnection({ deviceId: 'computer',
  authorize: async () => ({ baseUrl: endpoint.replace(/^ws/, 'http'), accessToken: 'test' }),
  randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)), createPeer,
  mode, error: (message) => errors.push(message), event: (event) => events.push(event),
  ready: () => { readyCount += 1; },
});

function send(frame: object) {
  if (socket?.readyState !== WebSocket.OPEN) throw new Error('Unavailable');
  socket.send(JSON.stringify(frame));
}

function reconnect() {
  clearTimeout(pcReconnect);
  const previous = socket;
  socket = undefined;
  previous?.close();
  link?.setRelayAvailable(false);
  pcReconnect = setTimeout(connectPc, 1500);
}

function connectPc() {
  const current = new WebSocket(endpoint);
  socket = current;
  current.onopen = () => send({ type: 'authenticate', role: 'desktop', deviceId: 'computer',
    transportVersion: 2, sessions: resume ? [resume] : [] });
  current.onclose = () => { if (socket === current) reconnect(); };
  current.onmessage = ({ data }) => {
    if (socket === current) void receive(JSON.parse(data)).catch((error) => errors.push(String(error)));
  };
}

async function receive(frame: Record<string, unknown>) {
  if (frame.type === 'registered') { if (!link) mode('registered'); return; }
  if (frame.type === 'peer-open') {
    resume = { sessionId: String(frame.sessionId), resumeToken: String(frame.resumeToken) };
    link = new ChatLink({ ...resume, desktop: true, secret: keys.secret, publicKey: String(frame.publicKey),
      transportVersion: 2, iceServers: [], createPeer, signal: send, relayBuffered: () => socket?.bufferedAmount ?? 0,
      reconnectRelay: reconnect, mode, error: (message) => errors.push(message), message: respond,
    });
    send({ type: 'signal', sessionId: resume.sessionId, payload: { kind: 'key', key: keys.publicKey } });
  }
  if (frame.type === 'signal') await link?.acceptSignal(frame.payload as Signal);
  if (frame.type === 'relay') link?.receive(String(frame.payload));
  if (frame.type === 'peer-offline') link?.setRelayAvailable(false);
  if (frame.type === 'resumed') link?.setRelayAvailable(true);
  if (frame.type === 'peer-close') link?.close();
}

function respond(message: RpcMessage) {
  if (message.kind !== 'request') return;
  executions += 1;
  void link?.send({ kind: 'response', id: message.id, data: message.body });
}

if (desktop) connectPc();
else phone.start();

declare global {
  interface Window {
    hotChat: { events: unknown[]; modes: string[]; errors: string[];
      request: (text: string) => Promise<unknown>; stream: (text: string) => Promise<void>;
      blockDirect: (value: boolean) => void; stats: () => { beats: number; readyCount: number; executions: number };
      disconnect: () => void };
  }
}
window.hotChat = { events, modes, errors, request: (text) => phone.request('request', { text }),
  stream: async (text) => { await link?.send({ kind: 'event', event: { text } }); },
  blockDirect: (value) => { blocked = value; if (value) { for (const peer of rtc) peer.close(); rtc.clear(); } },
  stats: () => ({ beats, readyCount, executions }), disconnect: () => phone.stop() };
