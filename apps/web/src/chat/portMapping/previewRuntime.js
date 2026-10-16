(() => {
  const REQUEST_TIMEOUT_MS = 35000;
  const GRAPH_TIMEOUT_MS = 120000;
  const pending = new Map();
  const sockets = new Map();
  const modules = new Map();
  let port;
  let base;
  let sequence = 0;
  let failed = false;
  const diagnostic = window.__previewDiagnostic;
  delete window.__previewDiagnostic;
  function request(type, input = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error('Preview request timed out'), { previewFailure: 'load-error' }));
      }, type === 'document' || type === 'module' ? GRAPH_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      port.postMessage({ id, type, ...input });
    });
  }
  function receive(event) {
    const reply = event.data;
    if (reply.type === 'socket') { sockets.get(reply.socketId)?.receive(reply.event); return; }
    const job = pending.get(reply.id);
    if (!job) return;
    pending.delete(reply.id); clearTimeout(job.timer);
    if (reply.error) job.reject(Object.assign(new Error(reply.error), {
      previewFailure: reply.failure, previewDiagnostic: reply.diagnostic,
    }));
    else job.resolve(reply.value);
  }
  function absolute(value) { return new URL(value, base).href; }
  function announceError(error) {
    failed = true;
    port?.postMessage({ type: 'preview-error', failure: error?.previewFailure ?? 'script-error',
      diagnostic: error?.previewDiagnostic ?? diagnostic(error) });
    console.warn('Port mapping preview:', error?.message ?? 'Script failed');
  }
  window.addEventListener('error', event => { if (event.error) announceError(event.error); });
  window.addEventListener('unhandledrejection', event => announceError(event.reason));
  window.fetch = async (value, options = {}) => {
    const original = value instanceof Request ? value : undefined;
    const url = absolute(original ? original.url : String(value));
    const method = options.method ?? original?.method ?? 'GET';
    const headers = [...new Headers(options.headers ?? original?.headers).entries()];
    const body = options.body !== undefined ? new Uint8Array(await new Response(options.body).arrayBuffer())
      : original && !['GET', 'HEAD'].includes(method) ? new Uint8Array(await original.arrayBuffer()) : undefined;
    const reply = await request('fetch', { input: { url, method, headers, body } });
    const response = new Response([204, 205, 304].includes(reply.status) ? null : reply.body,
      { status: reply.status, headers: reply.headers });
    Object.defineProperty(response, 'url', { value: reply.url });
    return response;
  };
  class PreviewSocket extends EventTarget {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3;
    readyState = 0; bufferedAmount = 0; extensions = ''; protocol = ''; binaryType = 'blob';
    onopen = null; onmessage = null; onerror = null; onclose = null;
    constructor(url, protocols = []) {
      super(); this.url = new URL(url, base).href; this.id = String(++sequence);
      sockets.set(this.id, this);
      request('ws-open', { socketId: this.id, url: this.url,
        protocols: typeof protocols === 'string' ? [protocols] : protocols })
        .catch(() => { this.receive({ type: 'error' }); this.receive({ type: 'close' }); });
    }
    receive(event) {
      if (event.type === 'open') { this.readyState = 1; this.protocol = event.protocol; }
      if (event.type === 'close') { this.readyState = 3; sockets.delete(this.id); }
      let message;
      if (event.type === 'message') {
        const data = typeof event.data === 'string' ? event.data
          : this.binaryType === 'arraybuffer' ? event.data.buffer : new Blob([event.data]);
        message = new MessageEvent('message', { data });
      } else if (event.type === 'close') {
        message = new CloseEvent('close', { code: event.code ?? 1006, wasClean: event.wasClean ?? false });
      }
      else message = new Event(event.type);
      this.dispatchEvent(message); this['on' + event.type]?.(message);
    }
    send(value) {
      if (this.readyState !== 1) throw new DOMException('Socket is not open', 'InvalidStateError');
      const bytes = typeof value === 'string' ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : value;
      Promise.resolve(bytes instanceof Blob ? bytes.arrayBuffer().then(buffer => new Uint8Array(buffer)) : bytes)
        .then(data => request('ws-send', { socketId: this.id, data })).catch(announceError);
    }
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 2;
      request('ws-close', { socketId: this.id }).catch(() => this.receive({ type: 'close' }));
    }
  }
  window.WebSocket = PreviewSocket;
  window.__installPreviewXhr(); delete window.__installPreviewXhr;

  function installResourceSetter(prototype, attribute) {
    const original = Object.getOwnPropertyDescriptor(prototype, attribute);
    if (!original?.set) return;
    Object.defineProperty(prototype, attribute, { ...original, set(value) {
      if (/^(data:|blob:|#)/i.test(value)) { original.set.call(this, value); return; }
      const node = this;
      request('asset', { url: absolute(value) }).then(data => original.set.call(node, data)).catch(announceError);
    } });
  }
  for (const [prototype, attribute] of [[HTMLImageElement.prototype, 'src'], [HTMLScriptElement.prototype, 'src'],
    [HTMLLinkElement.prototype, 'href'], [HTMLMediaElement.prototype, 'src']]) installResourceSetter(prototype, attribute);

  function navigate(input) { port.postMessage({ type: 'navigate', input }); }
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || event.defaultPrevented) return;
    event.preventDefault();
    const url = new URL(anchor.getAttribute('href'), base);
    if (url.hash && url.pathname === new URL(base).pathname) {
      document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView(); return;
    }
    navigate({ url: url.href });
  });
  function submitForm(event) {
    if (event.defaultPrevented) return;
    const form = event.target;
    const method = (form.method || 'GET').toUpperCase();
    const values = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === 'string') values.append(key, value);
    const url = new URL(form.getAttribute('action') || base, base);
    if (method === 'GET') { url.search = values.toString(); navigate({ url: url.href }); }
    else navigate({ url: url.href, method, headers: [['Content-Type', 'application/x-www-form-urlencoded']],
      body: new TextEncoder().encode(values.toString()) });
  }
  document.addEventListener('submit', event => {
    // CSP form-action 'none' blocks native submission. Wait until all page handlers
    // (including delegated document/window listeners) have had a chance to cancel it.
    setTimeout(() => submitForm(event), 0);
  });

  function installModules(incoming) {
    const imports = {};
    for (const module of incoming) {
      if (modules.has(module.url)) continue;
      const blob = URL.createObjectURL(new Blob([module.code], { type: 'text/javascript' }));
      modules.set(module.url, blob); imports[module.url] = blob;
    }
    if (!Object.keys(imports).length) return;
    const map = document.createElement('script'); map.type = 'importmap';
    map.textContent = JSON.stringify({ imports }); document.head.prepend(map);
  }
  window.__importPreviewModule = async (value, importer, options) => {
    const url = new URL(value, importer).href;
    if (!modules.has(url)) {
      const content = await request('module', { url });
      installModules(content.modules);
      return import(content.url, options);
    }
    return import(url, options);
  };

  async function render() {
    const content = await request('document');
    base = content.url;
    window.__installPreviewBrowser(base, {
      route(url) { base = url; port.postMessage({ type: 'route', input: { url } }); },
      navigate(url) { navigate({ url }); },
    });
    delete window.__installPreviewBrowser;
    window.__installPreviewStorage(content.storage, message => port.postMessage(message));
    delete window.__installPreviewStorage;
    document.documentElement.innerHTML = content.html;
    installModules(content.modules);
    for (const item of content.scripts) {
      const script = document.createElement('script');
      if (item.module) {
        await import(item.source);
      } else { script.textContent = item.source; document.body.append(script); }
    }
    document.dispatchEvent(new Event('DOMContentLoaded'));
    window.dispatchEvent(new Event('load'));
    if (!failed) port.postMessage({ type: 'preview-ready' });
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || port || event.data?.type !== 'port-mapping-preview' || !event.ports[0]) return;
    port = event.ports[0]; port.onmessage = receive;
    render().catch(announceError);
  });
})();
