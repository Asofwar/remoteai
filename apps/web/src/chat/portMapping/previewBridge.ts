import { mappingUrl, type MappingHttpRequest } from '../../../../../shared/port-mapping/http';
import type { MappingWebSocket } from '../../../../../shared/port-mapping/websocket';
import type { WebMappingTunnel } from './httpTunnel';
import { previewDocument } from './previewDocument';
import { PreviewAssets } from './previewAssets';
import runtime from './previewRuntime.js?raw';
import xhr from './previewXhr.js?raw';
import storageRuntime from './previewStorageRuntime.js?raw';
import diagnostics from './previewDiagnostics.js?raw';
import navigationRuntime from './previewNavigation.js?raw';
import browserRuntime from './previewBrowser.js?raw';
import type { PreviewStorage } from './previewStorage';
import { isPreviewFailure, PreviewError, previewDiagnostic, previewFailure, type PreviewStatus } from './previewErrors';

// The opaque sandbox cannot read app cookies/storage or reach app APIs, even if remote scripts are hostile.
export const PREVIEW_DOCUMENT = '<!doctype html><meta charset="utf-8">'
  + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
  + 'script-src \'unsafe-inline\' blob:; style-src \'unsafe-inline\' data: blob:; '
  + 'img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src \'none\'; '
  + 'form-action \'none\'; base-uri \'none\'">'
  + `<script>${[xhr, storageRuntime, navigationRuntime, browserRuntime, diagnostics, runtime]
    .join('\n').replace(/<\/script/gi, '<\\/script')}</script>`;

type PreviewMessage = { id?: number; type?: string; input?: MappingHttpRequest; url?: string;
  socketId?: string; protocols?: string[]; data?: string | Uint8Array; failure?: unknown;
  area?: unknown; operation?: unknown; key?: unknown; value?: unknown; diagnostic?: unknown };

export function attachPreview(options: {
  frame: HTMLIFrameElement; tunnel: WebMappingTunnel; input: MappingHttpRequest; storage: PreviewStorage;
  navigate: (input: MappingHttpRequest) => void; route: (input: MappingHttpRequest) => void;
  status: (value: PreviewStatus) => void;
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
      case 'document': return { ...await previewDocument(requests, input, assets), storage: options.storage.snapshot() };
      case 'module': return assets.loadModule(String(message.url), input.url);
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
    if (message.type === 'storage') { options.storage.apply(message); return; }
    if (message.type === 'preview-ready') { status('ready'); return; }
    if (message.type === 'preview-error') {
      const failure = isPreviewFailure(message.failure) ? message.failure : 'script-error';
      console.warn('Port mapping preview:', failure, previewDiagnostic(message.diagnostic));
      status(failure); return;
    }
    if (message.type === 'navigate') {
      try { navigate(validateRequest(message.input, input.url)); } catch { status('address-error'); }
      return;
    }
    if (message.type === 'route') {
      try { options.route(validateRequest(message.input, input.url)); } catch { status('address-error'); }
      return;
    }
    if (!Number.isSafeInteger(message.id) || active >= 128) return;
    active++;
    void handle(message).then(value => post({ id: message.id, value }))
      .catch(error => {
        const failure = previewFailure(error);
        const diagnostic = previewDiagnostic(error instanceof PreviewError ? error.diagnostic : undefined);
        console.warn('Port mapping preview:', failure, diagnostic);
        post({ id: message.id, error: 'Preview request failed', failure, diagnostic });
      })
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
