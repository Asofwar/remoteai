// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { PreviewAssets } from '../../../../../web/src/chat/portMapping/previewAssets';
import { previewDocument } from '../../../../../web/src/chat/portMapping/previewDocument';
import type { MappingHttpRequest } from '../../../../../../shared/port-mapping/http';

const ORIGIN = 'http://127.0.0.1:8306';
function fixture(files: Record<string, string>) {
  return { request: async (input: MappingHttpRequest) => {
    const value = files[new URL(input.url).pathname];
    return { url: input.url, status: value === undefined ? 404 : 200,
      headers: [] as [string, string][], body: new TextEncoder().encode(value ?? 'Not found') };
  } };
}

it('keeps the document, styles and scripts usable when images and fallback fonts are missing', async () => {
  const tunnel = fixture({
    '/': '<h1>Application</h1><img src="/missing.png" alt="Logo"><link rel="stylesheet" href="/app.css">'
      + '<script type="module" src="/app.js"></script>',
    '/app.css': '@font-face{font-family:example;src:url(/missing.woff2)}body{color:red}',
    '/app.js': 'export const ready = true;',
  });
  const warnings: string[] = [];
  const assets = new PreviewAssets(tunnel, ORIGIN, warning => warnings.push(warning));
  const result = await previewDocument(tunnel, { url: ORIGIN + '/' }, assets);
  expect(result.html).toContain('<h1>Application</h1>');
  expect(result.html).toContain('body{color:red}');
  expect(result.html).toContain('src="data:,"');
  expect(result.modules.some(module => module.code.includes('ready = true'))).toBe(true);
  expect(warnings.sort()).toEqual(['http-404-font', 'http-404-image']);
});

it('retains errors for essential scripts and resources outside the selected mapping', async () => {
  const assets = new PreviewAssets(fixture({}), ORIGIN);
  await expect(assets.loadModule('/missing.js', ORIGIN)).rejects.toMatchObject({ failure: 'resource-error' });
  await expect(assets.data('/missing.js', ORIGIN)).rejects.toMatchObject({ failure: 'resource-error' });
  await expect(assets.data('http://other.invalid/logo.png', ORIGIN, { optional: true }))
    .rejects.toMatchObject({ failure: 'address-error' });
});
