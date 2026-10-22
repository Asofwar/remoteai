import assert from 'node:assert/strict';
import test from 'node:test';
import { bundleDesktopService } from './prepare-desktop-service.mjs';

test('bundles the unattended host without WebView capture dependencies', async () => {
  const result = await bundleDesktopService({ write: false, metafile: true });
  const inputs = Object.keys(result.metafile.inputs).map(path => path.replaceAll('\\', '/'));
  assert(inputs.some(path => path.endsWith('/remoteDesktop/nativeSession.ts')));
  assert(!inputs.some(path => /\/remoteDesktop\/(capture|session|hostSession)\.ts$/.test(path)),
    'The unattended host must use its native session factory without importing WebView fallbacks.');
});
