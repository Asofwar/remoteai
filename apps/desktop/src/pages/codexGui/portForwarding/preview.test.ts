// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { previewDocument } from '../../../../../web/src/chat/portMapping/previewDocument';
import { PreviewAssets } from '../../../../../web/src/chat/portMapping/previewAssets';
import type { MappingHttpRequest } from '../../../../../../shared/port-mapping/http';

const ORIGIN = 'http://127.0.0.1:3000';
const encoder = new TextEncoder();

function fixture(files: Record<string, string>) {
  const fetched: string[] = [];
  let active = 0;
  let peak = 0;
  return {
    fetched, peak: () => peak,
    request: async (input: MappingHttpRequest) => {
      const path = new URL(input.url).pathname;
      fetched.push(path);
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, path === '/first.js' ? 20 : 5));
      active--;
      if (!(path in files)) throw new Error(`Missing fixture ${path}`);
      return { status: 200, headers: [['content-type', 'text/plain']] as [string, string][],
        body: encoder.encode(files[path]), url: input.url };
    },
  };
}

it('downloads independent resources concurrently while preserving script and stylesheet order', async () => {
  const tunnel = fixture({
    '/': '<script src="/first.js"></script><script src="/second.js"></script>'
      + '<link rel="stylesheet" href="/first.css"><link rel="stylesheet" href="/second.css">'
      + '<img src="/image.svg"><img src="/image.svg">',
    '/first.js': 'first()', '/second.js': 'second()',
    '/first.css': 'body{color:red}', '/second.css': 'body{color:blue}', '/image.svg': '<svg/>',
  });
  const document = await previewDocument(tunnel, { url: ORIGIN + '/' });
  expect(tunnel.peak()).toBeGreaterThanOrEqual(4);
  expect(document.scripts.map(script => script.source)).toEqual(['first()', 'second()']);
  expect(document.html.indexOf('color:red')).toBeLessThan(document.html.indexOf('color:blue'));
  expect(tunnel.fetched.filter(path => path === '/image.svg')).toHaveLength(1);
  expect(document.html.match(/data:text\/plain/g)).toHaveLength(2);
});

it('finishes parallel module roots with shared and cyclic dependencies without duplicate fetches', async () => {
  const tunnel = fixture({
    '/': '<script type="module" src="/a.js"></script><script type="module" src="/b.js"></script>',
    '/a.js': 'import "./shared.js"; import "./b.js"; export const a = 1;',
    '/b.js': 'import "./shared.js"; import "./a.js"; export const b = 2;',
    '/shared.js': 'export const shared = import.meta.url;',
  });
  const document = await previewDocument(tunnel, { url: ORIGIN + '/' });
  expect(document.modules).toHaveLength(3);
  expect(new Set(tunnel.fetched).size).toBe(tunnel.fetched.length);
  expect(document.modules.every(module => module.code.length > 0)).toBe(true);
  expect(document.modules.find(module => module.url.endsWith('/a.js'))?.code).toContain(ORIGIN + '/b.js');
  expect(document.modules.find(module => module.url.endsWith('/shared.js'))?.code).toContain(ORIGIN + '/shared.js');
});

it('resolves nested CSS images against the stylesheet that owns them', async () => {
  const tunnel = fixture({
    '/': '<link rel="stylesheet" href="/css/main.css">',
    '/css/main.css': '@import "nested/child.css"; body{background:url("../outer.svg")}',
    '/css/nested/child.css': '.child{background:url("child.svg")}',
    '/css/nested/child.svg': 'child', '/outer.svg': 'outer',
  });
  const document = await previewDocument(tunnel, { url: ORIGIN + '/' });
  expect(document.html).toContain('Y2hpbGQ=');
  expect(document.html).toContain('b3V0ZXI=');
  expect(tunnel.fetched).toHaveLength(5);
});

it('does not fetch lazy routes or optional imports while preparing the initial document', async () => {
  const tunnel = fixture({
    '/': '<script type="module" src="/main.js"></script>',
    '/main.js': 'export const route = () => import("./optional.js");'
      + 'export const locale = name => import(`./locales/${name}.js`);',
  });
  const document = await previewDocument(tunnel, { url: ORIGIN + '/' });
  expect(tunnel.fetched).toEqual(['/', '/main.js']);
  expect(document.modules).toHaveLength(1);
  expect(document.modules[0].code).toContain('globalThis.__importPreviewModule');
});

it('loads a development module graph larger than 128 files with bounded request concurrency', async () => {
  const dependencies = Array.from({ length: 160 }, (_, index) => `/module-${index}.js`);
  const tunnel = fixture({
    '/': '<script type="module" src="/main.js"></script>',
    '/main.js': dependencies.map(path => `import ${JSON.stringify(path)};`).join('\n'),
    ...Object.fromEntries(dependencies.map(path => [path, 'export const value = 1;'])),
  });
  const document = await previewDocument(tunnel, { url: ORIGIN + '/' });
  expect(document.modules).toHaveLength(161);
  expect(tunnel.peak()).toBeLessThanOrEqual(8);
});

it('publishes complete shared and cyclic graphs for simultaneous lazy imports', async () => {
  const tunnel = fixture({
    '/a.js': 'import "./shared.js"; export const a = 1;',
    '/b.js': 'import "./shared.js"; export const b = 2;',
    '/shared.js': 'import "./a.js"; export const shared = 3;',
  });
  const assets = new PreviewAssets(tunnel, ORIGIN);
  const replies = await Promise.all([assets.loadModule('/a.js', ORIGIN), assets.loadModule('/b.js', ORIGIN)]);
  expect(replies[0].modules.map(module => module.url)).toEqual([ORIGIN + '/a.js', ORIGIN + '/shared.js']);
  expect(replies[1].modules.map(module => module.url)).toEqual([ORIGIN + '/b.js']);
  expect(replies.flatMap(reply => reply.modules).every(module => module.code)).toBe(true);
  expect(tunnel.fetched).toHaveLength(3);
});

it('republishes successful siblings when a failed lazy graph is retried', async () => {
  const files: Record<string, string> = {
    '/main.js': 'import "./ready.js"; import "./missing.js";',
    '/ready.js': 'import "./main.js"; export const ready = true;',
  };
  const tunnel = fixture(files);
  const assets = new PreviewAssets(tunnel, ORIGIN);
  await expect(assets.loadModule('/main.js', ORIGIN)).rejects.toThrow();
  files['/missing.js'] = 'export const recovered = true;';
  const reply = await assets.loadModule('/main.js', ORIGIN);
  expect(reply.modules.map(module => module.url)).toEqual([
    ORIGIN + '/main.js', ORIGIN + '/ready.js', ORIGIN + '/missing.js',
  ]);
  expect(reply.modules.every(module => module.code)).toBe(true);
});

it('rejects lazy imports outside the selected mapping before sending any requests', async () => {
  const tunnel = fixture({});
  const assets = new PreviewAssets(tunnel, ORIGIN);
  await expect(assets.loadModule('http://127.0.0.1:4000/other.js', ORIGIN))
    .rejects.toMatchObject({ failure: 'address-error' });
  expect(tunnel.fetched).toEqual([]);
});
