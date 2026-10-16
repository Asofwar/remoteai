import type { MappingHttpRequest } from '../../../../../shared/port-mapping/http';
import type { WebMappingTunnel } from './httpTunnel';
import { PreviewAssets, type PreviewModule } from './previewAssets';

export interface PreviewScript { module: boolean; source: string }
export interface PreviewDocument { html: string; scripts: PreviewScript[]; modules: PreviewModule[]; url: string }
const decoder = new TextDecoder();

export async function previewDocument(tunnel: Pick<WebMappingTunnel, 'request'>,
  input: MappingHttpRequest,
  assets = new PreviewAssets(tunnel, new URL(input.url).origin)): Promise<PreviewDocument> {
  const origin = new URL(input.url).origin;
  const reply = input.method && input.method !== 'GET'
    ? await tunnel.request(input) : await assets.load(input.url, origin, { accept: 'text/html' });
  const document = new DOMParser().parseFromString(decoder.decode(reply.body), 'text/html');
  const base = assets.url(document.querySelector('base[href]')?.getAttribute('href') ?? reply.url, reply.url);
  document.querySelectorAll('base, meta[http-equiv], iframe, object, embed, link[rel=preload], link[rel=modulepreload]')
    .forEach(node => node.remove());
  const [scripts] = await Promise.all([
    prepareScripts(document, assets, base),
    prepareStyles(document, assets, base),
    prepareImages(document, assets, base),
  ]);
  for (const node of document.querySelectorAll('a[href], form[action]')) {
    const attribute = node.tagName === 'A' ? 'href' : 'action';
    node.setAttribute(attribute, new URL(node.getAttribute(attribute)!, base).href);
    node.removeAttribute('target');
  }
  return { html: document.documentElement.innerHTML, scripts, modules: [...assets.modules.values()], url: reply.url };
}

async function prepareScripts(document: Document, assets: PreviewAssets, base: string) {
  const nodes = [...document.querySelectorAll('script')].filter(node =>
    ['', 'module', 'text/javascript', 'application/javascript'].includes(node.getAttribute('type') ?? ''));
  // Fetch concurrently, but keep document order for the sandbox's script execution.
  return Promise.all(nodes.map(async (node, index): Promise<PreviewScript> => {
    const src = node.getAttribute('src');
    const module = node.getAttribute('type') === 'module';
    let source = node.textContent ?? '';
    if (module) source = await assets.module(src ?? `#inline-module-${index}`, base, src ? undefined : source);
    else if (src) source = decoder.decode((await assets.load(src, base)).body);
    node.remove();
    return { module, source };
  }));
}

async function prepareStyles(document: Document, assets: PreviewAssets, base: string) {
  // Snapshot inline styles before replacing links so resolved CSS is not processed twice.
  const inline = [...document.querySelectorAll('style')];
  const external = [...document.querySelectorAll('link[rel=stylesheet]')].map(async node => {
    const reply = await assets.load(node.getAttribute('href') ?? '', base, { accept: 'text/css' });
    const style = document.createElement('style');
    style.textContent = await assets.css(decoder.decode(reply.body), reply.url);
    node.replaceWith(style);
  });
  const embedded = inline.map(async node => {
    node.textContent = await assets.css(node.textContent ?? '', base);
  });
  const attributes = [...document.querySelectorAll('[style]')].map(async node => {
    node.setAttribute('style', await assets.css(node.getAttribute('style') ?? '', base));
  });
  await Promise.all([...external, ...embedded, ...attributes]);
}

async function prepareImages(document: Document, assets: PreviewAssets, base: string) {
  const nodes = [...document.querySelectorAll('img, source, video, audio, input[type=image]')];
  await Promise.all(nodes.map(async node => {
    const source = node.getAttribute('src') ?? node.getAttribute('srcset')?.split(',')[0].trim().split(/\s/)[0];
    node.removeAttribute('srcset');
    const poster = node.getAttribute('poster');
    await Promise.all([
      source && assets.data(source, base).then(value => node.setAttribute('src', value)),
      poster && assets.data(poster, base).then(value => node.setAttribute('poster', value)),
    ]);
  }));
  document.querySelectorAll('link:not([rel=stylesheet])').forEach(node => node.remove());
}
