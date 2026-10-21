import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { siteUrl, basePath, resolveSiteUrl } from '../site.config.mjs';

const dist = resolve('dist');
const sitemap = readFileSync(resolve(dist, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
const htmlFiles = urls.map((url) => ({
  url,
  html: readFileSync(resolve(dist, new URL(url).pathname.slice(basePath.length), 'index.html'), 'utf8'),
}));

test('exports both languages, every feature, and crawlable content without JavaScript', () => {
  assert.equal(urls.length, 30);
  const titles = new Set();
  for (const { url, html } of htmlFiles) {
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, url);
    assert.ok(!html.includes('<!--site-body-->'), url);
    assert.ok(!html.includes('<!--site-head-->'), url);
    assert.ok(html.includes('id="main"'), url);
    assert.ok(html.includes('<h2'), url);
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    assert.ok(title, url);
    assert.ok(!titles.has(title), `Duplicate title: ${title}`);
    titles.add(title);
    assert.ok(html.includes(`rel="canonical" href="${url}"`), url);
    assert.ok(html.includes('hreflang="zh-CN"') && html.includes('hreflang="en"'), url);
    const english = new URL(url).pathname.slice(basePath.length).startsWith('en/');
    assert.ok(html.includes(`<html lang="${english ? 'en' : 'zh-CN'}">`), url);
    const graphs = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
    assert.equal(graphs.length, 1, url);
    assert.ok(
      JSON.parse(graphs[0][1])['@graph'].some((node) => node['@type'] === 'WebPage'),
      url,
    );
    assert.ok(html.includes('data-css-hash'), `Missing prerendered Ant Design styles: ${url}`);
    assert.ok(!html.includes('css-dev-only-do-not-override'), `Server styles differ from the production client: ${url}`);
  }
});

test('all local links, navigation targets, styles, scripts and images resolve in the export', () => {
  for (const { url, html } of htmlFiles) {
    const targets = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const target of targets) {
      if (/^(?:data:|mailto:|tel:)/.test(target)) continue;
      const resolved = new URL(target.replace(/&amp;/g, '&'), url);
      if (resolved.origin !== new URL(siteUrl).origin) continue;
      assert.ok(resolved.pathname.startsWith(basePath), `Outside website base: ${target}`);
      let file = resolve(dist, decodeURI(resolved.pathname.slice(basePath.length)));
      if (resolved.pathname.endsWith('/')) file = resolve(file, 'index.html');
      assert.ok(existsSync(file), `${url} links to missing ${target}`);
      if (resolved.hash && file.endsWith('.html')) {
        const document = readFileSync(file, 'utf8');
        assert.ok(document.includes(`id="${resolved.hash.slice(1)}"`), `Missing fragment: ${target} on ${url}`);
      }
    }
  }
});

test('feature exports contain detailed explanations, steps, images and matching text versions', () => {
  for (const { url, html } of htmlFiles.filter(({ url }) => /\/features\/[^/]+\/$/.test(url))) {
    assert.ok((html.match(/id="section-/g) ?? []).length >= 3, url);
    assert.ok(html.includes('id="getting-started"'), url);
    assert.ok(html.includes('<figure'), url);
    assert.ok(html.includes('<figcaption'), url);
    const faq = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1])['@graph'].find(
      (node) => node['@type'] === 'FAQPage',
    );
    assert.equal(faq.mainEntity.length, 2, url);
    const markdown = readFileSync(resolve(dist, new URL(url).pathname.slice(basePath.length), 'index.md'), 'utf8');
    assert.ok(markdown.length > 900, url);
    assert.ok(markdown.includes('https://github.com/piperhex/remoteai/blob/master/'), url);
  }
});

test('404 is not indexed and discovery files use the configured deployment URL', () => {
  assert.ok(readFileSync(resolve(dist, '404.html'), 'utf8').includes('noindex, follow'));
  assert.ok(readFileSync(resolve(dist, 'robots.txt'), 'utf8').includes(`Sitemap: ${siteUrl}sitemap.xml`));
  assert.ok(readFileSync(resolve(dist, 'llms.txt'), 'utf8').includes(`${siteUrl}features/codex-gui/index.md`));
  assert.ok(existsSync(resolve(dist, '.nojekyll')));
  assert.ok(!existsSync(resolve(dist, 'entry-server.js')));
});

test('custom domains and subpaths normalize safely', () => {
  assert.equal(resolveSiteUrl('https://example.com'), 'https://example.com/');
  assert.equal(resolveSiteUrl('https://example.com/product'), 'https://example.com/product/');
  assert.throws(() => resolveSiteUrl('javascript:alert(1)'));
  assert.throws(() => resolveSiteUrl('https://example.com/?preview=1'));
  assert.throws(() => resolveSiteUrl('https://user:secret@example.com/'));
});
