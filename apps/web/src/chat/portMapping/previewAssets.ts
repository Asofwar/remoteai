import { init, parse } from 'es-module-lexer';
import { encodeBase64, mappingUrl, type MappingHttpResponse } from '../../../../../shared/port-mapping/http';
import type { WebMappingTunnel } from './httpTunnel';
import { PreviewError, resourceDiagnostic } from './previewErrors';
import { BROWSER_MODULE, previewModuleGlobals } from './previewModuleGlobals';

const MAX_RESOURCES = 2048;
const MAX_ACTIVE_REQUESTS = 8;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_CSS_DEPTH = 8;
const decoder = new TextDecoder();
export interface PreviewModule { url: string; code: string }

/** Resource graphs are bounded and scoped to one mapping; raw remote HTML never enters the host DOM. */
export class PreviewAssets {
  private readonly resources = new Map<string, Promise<MappingHttpResponse>>();
  readonly modules = new Map<string, PreviewModule>();
  private bytes = 0;
  private activeRequests = 0;
  private readonly waiting: (() => void)[] = [];
  private moduleQueue = Promise.resolve();
  constructor(private readonly tunnel: Pick<WebMappingTunnel, 'request'>, readonly origin: string,
    private readonly warn?: (diagnostic: string) => void) {}

  url(value: string, base: string) {
    try { return mappingUrl(new URL(value, base).href, this.origin).href; }
    catch { throw new PreviewError('address-error'); }
  }

  async load(value: string, base: string,
    options: { redirects?: string[]; accept?: string } = {}): Promise<MappingHttpResponse> {
    const { redirects = [], accept = '*/*' } = options;
    const url = this.url(value, base);
    if (redirects.length >= MAX_CSS_DEPTH || redirects.includes(url)) throw new Error('Redirect loop');
    const key = `${accept} ${url}`;
    let pending = this.resources.get(key);
    if (!pending) {
      if (this.resources.size >= MAX_RESOURCES) throw new PreviewError('resource-limit');
      pending = this.request(url, accept).then(async reply => {
        this.bytes += reply.body.length;
        if (this.bytes > MAX_DOCUMENT_BYTES) throw new PreviewError('resource-limit');
        if (reply.status >= 300 && reply.status < 400) {
          const location = new Headers(reply.headers).get('location');
          if (!location) throw new Error('Invalid redirect');
          return this.load(location, url, { redirects: [...redirects, url], accept });
        }
        if (reply.status >= 400) {
          throw new PreviewError('resource-error', resourceDiagnostic(url, reply.status, accept));
        }
        return reply;
      }).catch(error => {
        this.resources.delete(key);
        throw error;
      });
      this.resources.set(key, pending);
    }
    return pending;
  }

  private async request(url: string, accept: string) {
    // Admit large module graphs gradually instead of overflowing the tunnel's bounded wait queue.
    if (this.activeRequests >= MAX_ACTIVE_REQUESTS) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.activeRequests++;
    try { return await this.tunnel.request({ url, headers: [['Accept', accept]] }); }
    finally {
      const next = this.waiting.shift();
      if (next) next(); else this.activeRequests--;
    }
  }

  async data(value: string, base: string, options: { optional?: boolean } = {}): Promise<string> {
    if (/^(data:|#)/i.test(value)) return value;
    try {
      const reply = await this.load(value, base);
      const type = new Headers(reply.headers).get('content-type') ?? 'application/octet-stream';
      return `data:${type.split(';')[0]};base64,${encodeBase64(reply.body)}`;
    } catch (error) {
      if (!options.optional || !(error instanceof PreviewError) || error.failure !== 'resource-error') throw error;
      // Missing media should behave like a broken browser image/font, without blocking the entire document.
      this.warn?.(error.diagnostic ?? 'script-exception');
      return 'data:,';
    }
  }

  async css(source: string, base: string, depth = 0): Promise<string> {
    if (depth > MAX_CSS_DEPTH) throw new Error('CSS nesting too deep');
    let result = await replaceAsync(source, /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/gi,
      async match => {
        const reply = await this.load(match[1], base, { accept: 'text/css' });
        return this.css(decoder.decode(reply.body), reply.url, depth + 1);
      });
    result = await replaceAsync(result, /url\(\s*(["']?)(.*?)\1\s*\)/gi,
      async match => `url("${await this.data(match[2], base, { optional: true })}")`);
    return result;
  }

  loadModule(value: string, base: string): Promise<{ url: string; modules: PreviewModule[] }> {
    // Serialize graph publication so concurrent dynamic imports never receive half-prepared cyclic modules.
    const job = this.moduleQueue.then(async () => {
      const previous = new Set(this.modules.keys());
      try {
        const url = await this.module(value, base);
        return { url, modules: [...this.modules.values()].filter(module => !previous.has(module.url)) };
      } catch (error) {
        // A failed graph was never published to the frame. Its successful siblings must be sent on retry too.
        for (const url of this.modules.keys()) if (!previous.has(url)) this.modules.delete(url);
        throw error;
      }
    });
    this.moduleQueue = job.then(() => undefined, () => undefined);
    return job;
  }

  async module(value: string, base: string, inline?: string): Promise<string> {
    await init;
    const url = this.url(value, base);
    if (this.modules.has(url)) return url;
    if (this.modules.size >= MAX_RESOURCES) throw new PreviewError('resource-limit');
    const module = { url, code: '' };
    // Reserve before fetching: parallel parents may import the same module, including cycles.
    this.modules.set(url, module);
    try {
      const source = inline ?? decoder.decode((await this.load(url, base)).body);
      module.code = await this.rewriteModule(source, url);
    } catch (error) { this.modules.delete(url); throw error; }
    return url;
  }

  private async rewriteModule(source: string, url: string) {
    const globals = previewModuleGlobals(source);
    if (globals) this.modules.set(BROWSER_MODULE.url, BROWSER_MODULE);
    const [imports] = parse(source);
    const edits: { start: number; end: number; text: string }[] = [];
    let prefix = '__remoteMapping';
    while (source.includes(prefix)) prefix += '_';
    const metaName = `${prefix}Meta`;
    const importName = `${prefix}Import`;
    let needsMeta = false;
    let needsImport = false;
    const prepared = await Promise.allSettled(imports.map(async item => {
      if (item.type === 'import-meta') {
        needsMeta = true;
        edits.push({ start: item.start, end: item.end, text: metaName });
      } else if (item.type === 'dynamic') {
        needsImport = true;
        edits.push({ start: item.importStart, end: item.importStart + 'import'.length, text: importName });
      } else if (item.specifier) {
        const target = await this.module(item.specifier, url);
        edits.push({ start: item.start, end: item.end,
          text: target });
      }
    }));
    for (const result of prepared) if (result.status === 'rejected') throw result.reason;
    let code = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
    }
    if (needsMeta) code = `const ${metaName}={url:${JSON.stringify(url)}};\n` + code;
    if (needsImport) code = `const ${importName}=(value,options)=>`
      + `globalThis.__importPreviewModule(value,${JSON.stringify(url)},options);\n` + code;
    return globals + code;
  }
}

async function replaceAsync(source: string, pattern: RegExp, replace: (match: RegExpMatchArray) => Promise<string>) {
  const matches = [...source.matchAll(pattern)];
  const replacements = await Promise.all(matches.map(replace));
  let result = '';
  let offset = 0;
  for (const [index, match] of matches.entries()) {
    result += source.slice(offset, match.index) + replacements[index];
    offset = match.index! + match[0].length;
  }
  return result + source.slice(offset);
}
