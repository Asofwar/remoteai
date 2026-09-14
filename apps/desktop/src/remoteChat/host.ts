import { guiApi } from '../pages/codexGui/api';
import { CHAT_POLICY_MESSAGE, setChatPolicy } from '../../../../shared/remote-chat/policy';
import { keyPair } from '../../../../shared/remote-chat/cipher';
import { ChatLink } from '../../../../shared/remote-chat/link';
import { RtcPeer } from '../../../../shared/remote-chat/rtcPeer';
import { parseMessage, type ConnectionMode, type IceServer, type Signal }
  from '../../../../shared/remote-chat/protocol';
import { ChatOperations } from './operations';
import { guiComposer } from '../pages/codexGui/composerBridge';
import { COMPOSER_EVENT } from '../../../../shared/remote-chat/composer';
import { SIDEBAR_EVENT } from '../../../../shared/remote-chat/sidebar';
import { guiSidebar } from '../pages/codexGui/sidebarBridge';
import { EventStream } from './eventStream';
import { remoteQueue } from './queue';
import { QUEUE_EVENT } from '../../../../shared/remote-chat/queue';
import { GUI_ACCOUNTS_EVENT } from '../../../../shared/remote-chat/guiAccounts';
import { subscribeGuiEvent } from '../pages/codexGui/webEvents';
import { acknowledgedMessages } from './acknowledgedMessages';
import { guiAccountBalances } from './guiAccountBalances';

export interface ChatHostConfig { websocketUrl: string; accessToken: string; deviceId: string }
const HANDSHAKE_TIMEOUT_MS = 30_000;
const SOCKET_ERROR_GRACE_MS = 250;
const RECONNECT_DELAY_MS = 1500;

export class ChatHost {
  private socket?: WebSocket;
  private socketGeneration = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  private errorTimer?: ReturnType<typeof setTimeout>;
  private readonly resumes = new Map<string, string>();
  private readonly leases = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly links = new Map<string, ChatLink>();
  private readonly connectedSessions = new Set<string>();
  private readonly operations = new ChatOperations();
  private readonly stream = new EventStream((event) => this.broadcast(event));
  private unsubscribe?: () => void;
  private unsubscribeAccounts?: () => void;
  private readonly unsubscribeComposer: () => void;
  private readonly unsubscribeSidebar: () => void;
  private readonly unsubscribeQueue: () => void;
  private readonly unsubscribeMessages: () => void;
  private readonly unsubscribeBalances: () => void;
  private closed = false;

  constructor(public config: ChatHostConfig, private readonly onConnectionChange: (connected: boolean) => void) {
    this.unsubscribeBalances = guiAccountBalances.subscribe(() => {
      this.broadcast({ method: GUI_ACCOUNTS_EVENT, params: {} });
    });
    this.unsubscribeMessages = acknowledgedMessages.subscribe((event) => {
      this.stream.receive(this.operations.prepareEvent(event));
    });
    this.unsubscribeQueue = remoteQueue.subscribe((snapshot) => {
      this.broadcast({ method: QUEUE_EVENT, params: snapshot });
    });
    this.unsubscribeComposer = guiComposer.subscribe((snapshot) => {
      this.broadcast({ method: COMPOSER_EVENT, params: snapshot });
    });
    this.unsubscribeSidebar = guiSidebar.subscribe((snapshot) => {
      this.broadcast({ method: SIDEBAR_EVENT, params: snapshot });
    });
    void subscribeGuiEvent('codex-gui-account-changed', () => {
      this.broadcast({ method: GUI_ACCOUNTS_EVENT, params: {} });
    }).then((unsubscribe) => {
      if (this.closed) unsubscribe();
      else this.unsubscribeAccounts = unsubscribe;
    }).catch(() => this.close());
    this.connectSocket();
    void guiApi.subscribe((event) => {
      guiSidebar.receive(event); this.stream.receive(this.operations.prepareEvent(event));
    }).then((unsubscribe) => {
      if (this.closed) unsubscribe();
      else this.unsubscribe = unsubscribe;
    }).catch(() => this.close());
  }

  get alive() { return !this.closed; }

  updateConfig(config: ChatHostConfig): boolean {
    if (this.closed || config.deviceId !== this.config.deviceId || config.websocketUrl !== this.config.websocketUrl) {
      return false;
    }
    if (config.accessToken === this.config.accessToken) return true;
    try {
      const owner = (token: string): unknown => JSON.parse(atob(token.split('.')[1].replace(/-/g, '+')
        .replace(/_/g, '/'))).sub;
      if (!owner(config.accessToken) || owner(config.accessToken) !== owner(this.config.accessToken)) return false;
    } catch { return false; }
    this.config = config;
    this.reconnect();
    return true;
  }

  private connectSocket() {
    if (this.closed) return;
    const generation = ++this.socketGeneration;
    const socket = new WebSocket(this.config.websocketUrl);
    this.socket = socket;
    this.handshakeTimer = setTimeout(() => this.reconnect(), HANDSHAKE_TIMEOUT_MS);
    socket.onopen = () => {
      if (generation !== this.socketGeneration) { socket.close(); return; }
      const sessions = [...this.resumes].map(([sessionId, resumeToken]) => ({ sessionId, resumeToken }));
      this.send({ type: 'authenticate', role: 'desktop', accessToken: this.config.accessToken,
        deviceId: this.config.deviceId, transportVersion: 2, sessions });
    };
    socket.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (generation !== this.socketGeneration || typeof data !== 'string') return;
      void this.receive(data).catch(() => { if (generation === this.socketGeneration) this.close(); });
    };
    socket.onclose = (event) => {
      if (generation !== this.socketGeneration) return;
      clearTimeout(this.errorTimer);
      if ([4000, 4001].includes(event?.code)) this.close();
      else this.reconnect();
    };
    socket.onerror = () => {
      if (generation !== this.socketGeneration || this.errorTimer) return;
      this.errorTimer = setTimeout(() => {
        if (generation === this.socketGeneration) this.reconnect();
      }, SOCKET_ERROR_GRACE_MS);
    };
  }

  private reconnect() {
    if (this.closed) return;
    this.socketGeneration += 1;
    clearTimeout(this.handshakeTimer);
    clearTimeout(this.errorTimer);
    this.errorTimer = undefined;
    clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    for (const link of this.links.values()) link.setRelayAvailable(false);
    this.reconnectTimer = setTimeout(() => this.connectSocket(), RECONNECT_DELAY_MS);
  }

  private lease(sessionId: string, expiresAt: unknown) {
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) throw new Error('Invalid lease');
    clearTimeout(this.leases.get(sessionId));
    this.leases.set(sessionId, setTimeout(() => this.drop(sessionId), Math.max(0, expiresAt - Date.now())));
  }
  private broadcast(event: unknown) {
    for (const link of this.links.values()) void link.send({ kind: 'event', event }).catch(() => link.close());
  }

  private send(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Disconnected');
    this.socket.send(JSON.stringify(message));
  }

  private endSession(sessionId: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try { this.send({ type: 'peer-close', sessionId }); }
    catch { /* Local teardown must finish even if the closing socket cannot notify the coordinator. */ }
  }

  private async receive(data: string) {
    const message = parseMessage(data);
    if (message.type === CHAT_POLICY_MESSAGE) { setChatPolicy(message.policy); return; }
    if (message.type === 'registered') { clearTimeout(this.handshakeTimer); return; }
    const sessionId = message.sessionId;
    if (typeof sessionId !== 'string') return;
    if (message.type === 'peer-open') { this.open(sessionId, message); return; }
    const link = this.links.get(sessionId);
    if (!link) return;
    if (message.type === 'resumed') {
      this.lease(sessionId, message.expiresAt);
      link.setRelayAvailable(true);
    }
    if (message.type === 'peer-offline') link.setRelayAvailable(false);
    if (message.type === 'signal') await link.acceptSignal(message.payload as Signal);
    if (message.type === 'relay' && typeof message.payload === 'string') link.receive(message.payload);
    if (message.type === 'relay-ready') link.enableRelay();
    if (message.type === 'peer-close') { link.close(); this.links.delete(sessionId); }
  }

  private open(sessionId: string, message: Record<string, unknown>) {
    if (this.links.size >= 4 || this.links.has(sessionId)) return;
    if (message.transportVersion === 2 && typeof message.resumeToken === 'string') {
      this.resumes.set(sessionId, message.resumeToken);
      this.lease(sessionId, message.expiresAt);
    }
    const keys = keyPair((size) => crypto.getRandomValues(new Uint8Array(size)));
    const link = new ChatLink({
      sessionId, desktop: true, secret: keys.secret, publicKey: String(message.publicKey),
      transportVersion: Number(message.transportVersion), reconnectRelay: () => this.reconnect(),
      iceServers: message.iceServers as IceServer[],
      createPeer: (options) => new RtcPeer(options, () => new RTCPeerConnection({ iceServers: options.iceServers })),
      signal: (frame) => this.send(frame), relayBuffered: () => this.socket?.bufferedAmount ?? 0,
      mode: (mode) => this.updateConnection(sessionId, mode),
      error: () => this.drop(sessionId),
      message: (request) => {
        if (request.kind !== 'request') return;
        void this.operations.execute(request).then((response) => {
          // A history response may include buffered fragments. Deliver those first to avoid replaying them afterward.
          this.stream.flush();
          return link.send(response);
        }).catch(() => link.close());
      },
    });
    keys.secret.fill(0);
    this.links.set(sessionId, link);
    this.send({ type: 'signal', sessionId, payload: { kind: 'key', key: keys.publicKey } });
  }

  private updateConnection(sessionId: string, mode: ConnectionMode) {
    if (this.closed || !this.links.has(sessionId)) return;
    if (mode === 'direct' || mode === 'relay') this.connectedSessions.add(sessionId);
    else this.connectedSessions.delete(sessionId);
    this.onConnectionChange(this.connectedSessions.size > 0);
    if (mode === 'offline') this.drop(sessionId);
  }

  private drop(sessionId: string) {
    const link = this.links.get(sessionId);
    this.links.delete(sessionId);
    this.resumes.delete(sessionId);
    clearTimeout(this.leases.get(sessionId));
    this.leases.delete(sessionId);
    this.connectedSessions.delete(sessionId);
    this.onConnectionChange(this.connectedSessions.size > 0);
    link?.close();
    if (!this.closed) this.endSession(sessionId);
  }

  close() {
    if (this.closed) return;
    for (const sessionId of this.links.keys()) this.endSession(sessionId);
    this.closed = true;
    this.socketGeneration += 1;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.handshakeTimer);
    clearTimeout(this.errorTimer);
    for (const lease of this.leases.values()) clearTimeout(lease);
    this.leases.clear();
    this.resumes.clear();
    this.connectedSessions.clear();
    this.onConnectionChange(false);
    this.unsubscribe?.();
    this.unsubscribeAccounts?.();
    this.unsubscribeComposer();
    this.unsubscribeSidebar();
    this.unsubscribeQueue();
    this.unsubscribeMessages();
    this.unsubscribeBalances();
    this.stream.close();
    for (const link of this.links.values()) link.close();
    this.links.clear();
    this.socket?.close();
  }
}
