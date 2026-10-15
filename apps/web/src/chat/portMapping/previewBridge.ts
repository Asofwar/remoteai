import { mappingUrl, type MappingHttpRequest } from '../../../../../shared/port-mapping/http';
import type { MappingWebSocket } from '../../../../../shared/port-mapping/websocket';
import type { WebMappingTunnel } from './httpTunnel';
import { previewDocument } from './previewDocument';
import { PreviewAssets } from './previewAssets';
import runtime from './previewRuntime.js?raw';
import xhr from './previewXhr.js?raw';

// The opaque sandbox cannot read app cookies/storage or reach app APIs, even if remote scripts are hostile.
export const PREVIEW_DOCUMENT = '<!doctype html><meta charset="utf-8">'
  + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
  + 'script-src \'unsafe-inline\' blob:; style-src \'unsafe-inline\' data: blob:; '
  + 'img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src \'none\'; '
  + 'form-action \'none\'; base-uri \'none\'">'
  + `<script>${xhr.replace(/<\/script/gi, '<\\/script')}\n${runtime.replace(/<\/script/gi, '<\\/script')}</script>`;

type PreviewMessage = { id?: number; type?: string; input?: MappingHttpRequest; url?: string;
  socketId?: string; protocols?: string[]; data?: string | Uint8Array };

export function attachPreview(options: {
  frame: HTMLIFrameElement; tunnel: WebMappingTunnel; input: MappingHttpRequest;
  navigate: (input: MappingHttpRequest) => void; status: (value: 'ready' | 'error') => void;
}) {
  const { frame, tunnel, input, navigate, status } = options;
  const channel = new MessageChannel();
  const cancellation = new AbortController();
  const requests = { request: (request: MappingHttpRequest) => tunnel.request(request, cancellation.signal) };
  const sockets = new Map<string, Promise<MappingWebSocket>>();
  const assets = new PreviewAssets(requests, new URL(input.url).origin);
  let closed = false;
  let active = 0;
  const post = (message: object) => { if (!closed) channel.port1.postMessage(message); };
  async function handle(message: PreviewMessage): Promise<unknown> {
    switch (message.type) {
      case 'document': return previewDocument(requests, input);
      case 'fetch': return requests.request(validateRequest(message.input, input.url));
      case 'asset': return assets.data(String(message.url), input.url);
      case 'ws-open': {
        const id = message.socketId;
        if (typeof id !== 'string' || sockets.has(id) || sockets.size >= 4) throw new Error('Socket limit');
        const socket = tunnel.openWebSocket(String(message.url), message.protocols ?? [], event => {
          if (event.type === 'close') sockets.delete(id);
          post({ type: 'socket', socketId: id, event });
        });
        sockets.set(id, socket);
        await socket;
        return;
      }
      case 'ws-send': {
        const socket = await sockets.get(String(message.socketId));
        if (!socket || !(typeof message.data === 'string' || message.data instanceof Uint8Array)) {
          throw new Error('Invalid socket data');
        }
        return socket.send(message.data);
      }
      case 'ws-close': {
        const socket = await sockets.get(String(message.socketId));
        socket?.close(); sockets.delete(String(message.socketId)); return;
      }
      default: throw new Error('Unknown preview request');
    }
  }
  channel.port1.onmessage = event => {
    const message: PreviewMessage = event.data;
    if (!message || typeof message !== 'object' || closed) return;
    if (message.type === 'preview-ready') { status('ready'); return; }
    if (message.type === 'preview-error') { status('error'); return; }
    if (message.type === 'navigate') {
      try { navigate(validateRequest(message.input, input.url)); } catch { status('error'); }
      return;
    }
    if (!Number.isSafeInteger(message.id) || active >= 128) return;
    active++;
    void handle(message).then(value => post({ id: message.id, value }))
      .catch(() => post({ id: message.id, error: '网页未能加载，请确认服务已启动后刷新。' }))
      .finally(() => { active--; });
  };
  frame.contentWindow?.postMessage({ type: 'port-mapping-preview' }, '*', [channel.port2]);
  return () => {
    closed = true; cancellation.abort(); channel.port1.close();
    for (const socket of sockets.values()) void socket.then(value => value.close()).catch(() => undefined);
  };
}

function validateRequest(value: MappingHttpRequest | undefined, origin: string): MappingHttpRequest {
  if (!value || typeof value.url !== 'string') throw new Error('Invalid preview request');
  const url = mappingUrl(value.url, new URL(origin).origin).href;
  if (value.method !== undefined && typeof value.method !== 'string') throw new Error('Invalid method');
  if (value.body !== undefined && !(value.body instanceof Uint8Array)) throw new Error('Invalid body');
  if (value.headers !== undefined && (!Array.isArray(value.headers)
    || value.headers.some(pair => !Array.isArray(pair) || pair.length !== 2
      || pair.some(item => typeof item !== 'string')))) throw new Error('Invalid headers');
  return { url, method: value.method, headers: value.headers, body: value.body };
}
