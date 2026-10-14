import { init, parse } from 'es-module-lexer';
import { encodeBase64, mappingUrl, type MappingHttpResponse } from '../../../../../shared/port-mapping/http';
import type { WebMappingTunnel } from './httpTunnel';

const MAX_RESOURCES = 128;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_CSS_DEPTH = 8;
const decoder = new TextDecoder();
export interface PreviewModule { url: string; code: string }

/** Resource graphs are bounded and scoped to one mapping; raw remote HTML never enters the host DOM. */
export class PreviewAssets {
  private readonly resources = new Map<string, Promise<MappingHttpResponse>>();
  readonly modules = new Map<string, PreviewModule>();
  private bytes = 0;
  constructor(private readonly tunnel: WebMappingTunnel, readonly origin: string) {}

  url(value: string, base: string) { return mappingUrl(new URL(value, base).href, this.origin).href; }

  async load(value: string, base: string, redirects: string[] = []): Promise<MappingHttpResponse> {
    const url = this.url(value, base);
    if (redirects.length >= MAX_CSS_DEPTH || redirects.includes(url)) throw new Error('Redirect loop');
    let pending = this.resources.get(url);
    if (!pending) {
      if (this.resources.size >= MAX_RESOURCES) throw new Error('Preview has too many resources');
      pending = this.tunnel.request({ url }).then(async reply => {
        this.bytes += reply.body.length;
        if (this.bytes > MAX_DOCUMENT_BYTES) throw new Error('Preview too large');
        if (reply.status >= 300 && reply.status < 400) {
          const location = new Headers(reply.headers).get('location');
          if (!location) throw new Error('Invalid redirect');
          return this.load(location, url, [...redirects, url]);
        }
        if (reply.status >= 400) throw new Error(`Resource failed: ${reply.status}`);
        return reply;
      });
      this.resources.set(url, pending);
    }
    return pending;
  }

  async data(value: string, base: string): Promise<string> {
    if (/^(data:|#)/i.test(value)) return value;
    const reply = await this.load(value, base);
    const type = new Headers(reply.headers).get('content-type') ?? 'application/octet-stream';
    return `data:${type.split(';')[0]};base64,${encodeBase64(reply.body)}`;
  }

  async css(source: string, base: string, depth = 0): Promise<string> {
    if (depth > MAX_CSS_DEPTH) throw new Error('CSS nesting too deep');
    let result = await replaceAsync(source, /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/gi,
      async match => {
        const reply = await this.load(match[1], base);
        return this.css(decoder.decode(reply.body), reply.url, depth + 1);
      });
    result = await replaceAsync(result, /url\(\s*(["']?)(.*?)\1\s*\)/gi,
      async match => `url("${await this.data(match[2], base)}")`);
    return result;
  }

  async module(value: string, base: string, inline?: string): Promise<string> {
    await init;
    const url = this.url(value, base);
    if (this.modules.has(url)) return url;
    if (this.modules.size >= MAX_RESOURCES) throw new Error('Too many modules');
    const source = inline ?? decoder.decode((await this.load(url, base)).body);
    const module = { url, code: source };
    this.modules.set(url, module); // Mark before traversing so cyclic imports terminate.
    const [imports] = parse(source);
    const edits: { start: number; end: number; text: string }[] = [];
    const metaName = `__remoteMappingMeta${this.modules.size}`;
    let needsMeta = false;
    for (const item of imports) {
      if (item.type === 'import-meta') {
        needsMeta = true;
        edits.push({ start: item.start, end: item.end, text: metaName });
      } else if (item.specifier && !(item.type === 'dynamic' && item.glob)) {
        const target = await this.module(item.specifier, url);
        edits.push({ start: item.start, end: item.end,
          text: item.type === 'dynamic' ? JSON.stringify(target) : target });
      }
    }
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      module.code = module.code.slice(0, edit.start) + edit.text + module.code.slice(edit.end);
    }
    if (needsMeta) module.code = `const ${metaName}={url:${JSON.stringify(url)}};\n` + module.code;
    return url;
  }
}

async function replaceAsync(source: string, pattern: RegExp, replace: (match: RegExpMatchArray) => Promise<string>) {
  let result = '';
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    result += source.slice(offset, match.index) + await replace(match);
    offset = match.index! + match[0].length;
  }
  return result + source.slice(offset);
}
