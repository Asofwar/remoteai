import type { MappingHttpRequest } from '../../../../../shared/port-mapping/http';
import type { WebMappingTunnel } from './httpTunnel';
import { PreviewAssets, type PreviewModule } from './previewAssets';

export interface PreviewScript { module: boolean; source: string }
export interface PreviewDocument { html: string; scripts: PreviewScript[]; modules: PreviewModule[]; url: string }
const decoder = new TextDecoder();

export async function previewDocument(tunnel: WebMappingTunnel, input: MappingHttpRequest): Promise<PreviewDocument> {
  const origin = new URL(input.url).origin;
  const assets = new PreviewAssets(tunnel, origin);
  const reply = input.method && input.method !== 'GET'
    ? await tunnel.request(input) : await assets.load(input.url, origin);
  const document = new DOMParser().parseFromString(decoder.decode(reply.body), 'text/html');
  const base = assets.url(document.querySelector('base[href]')?.getAttribute('href') ?? reply.url, reply.url);
  document.querySelectorAll('base, meta[http-equiv], iframe, object, embed, link[rel=preload], link[rel=modulepreload]')
    .forEach(node => node.remove());
  const scripts = await prepareScripts(document, assets, base);
  await prepareStyles(document, assets, base);
  await prepareImages(document, assets, base);
  for (const node of document.querySelectorAll('a[href], form[action]')) {
    const attribute = node.tagName === 'A' ? 'href' : 'action';
    node.setAttribute(attribute, new URL(node.getAttribute(attribute)!, base).href);
    node.removeAttribute('target');
  }
  return { html: document.documentElement.innerHTML, scripts, modules: [...assets.modules.values()], url: reply.url };
}

async function prepareScripts(document: Document, assets: PreviewAssets, base: string) {
  const scripts: PreviewScript[] = [];
  for (const node of document.querySelectorAll('script')) {
    const type = node.getAttribute('type') ?? '';
    if (!['', 'module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    const src = node.getAttribute('src');
    const module = type === 'module';
    let source = node.textContent ?? '';
    if (module) source = await assets.module(src ?? `#inline-module-${scripts.length}`, base, src ? undefined : source);
    else if (src) source = decoder.decode((await assets.load(src, base)).body);
    scripts.push({ module, source });
    node.remove();
  }
  return scripts;
}

async function prepareStyles(document: Document, assets: PreviewAssets, base: string) {
  for (const node of document.querySelectorAll('link[rel=stylesheet]')) {
    const reply = await assets.load(node.getAttribute('href') ?? '', base);
    const style = document.createElement('style');
    style.textContent = await assets.css(decoder.decode(reply.body), reply.url);
    node.replaceWith(style);
  }
  for (const node of document.querySelectorAll('style')) {
    node.textContent = await assets.css(node.textContent ?? '', base);
  }
  for (const node of document.querySelectorAll('[style]')) {
    node.setAttribute('style', await assets.css(node.getAttribute('style') ?? '', base));
  }
}

async function prepareImages(document: Document, assets: PreviewAssets, base: string) {
  for (const node of document.querySelectorAll('img, source, video, audio, input[type=image]')) {
    const source = node.getAttribute('src') ?? node.getAttribute('srcset')?.split(',')[0].trim().split(/\s/)[0];
    node.removeAttribute('srcset');
    if (source) node.setAttribute('src', await assets.data(source, base));
    const poster = node.getAttribute('poster');
    if (poster) node.setAttribute('poster', await assets.data(poster, base));
  }
  document.querySelectorAll('link:not([rel=stylesheet])').forEach(node => node.remove());
}
