// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { previewDocument } from '../../../../../web/src/chat/portMapping/previewDocument';
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
