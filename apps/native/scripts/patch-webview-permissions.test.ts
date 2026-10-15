import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { patchWebViewPermissions } = require('./patch-webview-permissions.cjs') as {
  patchWebViewPermissions: (directory: string) => void;
};
const source = join(dirname(require.resolve('react-native-webview/package.json')), 'android/src');
const packagePath = 'com/reactnativecommunity/webview';

it('enforces deny in both architectures, preserves it on the view and applies idempotently', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'webview-permissions-'));
  try {
    cpSync(source, temporary, { recursive: true });
    patchWebViewPermissions(temporary);
    const read = (file: string) => readFileSync(join(temporary, file), 'utf8');
    const clientPath = `main/java/${packagePath}/RNCWebChromeClient.java`;
    const client = read(clientPath);
    expect(client.indexOf('request.deny()')).toBeLessThan(client.indexOf('ContextCompat.checkSelfPermission'));
    expect(client).toContain('if (mWebView.remoteAiDenyMediaCapture)');
    expect(read(`main/java/${packagePath}/RNCWebView.java`)).toContain('boolean remoteAiDenyMediaCapture = false');
    for (const arch of ['oldarch', 'newarch']) {
      expect(read(`${arch}/${packagePath}/RNCWebViewManager.java`))
        .toContain('view.getWebView().remoteAiDenyMediaCapture = "deny".equals(value)');
    }
    patchWebViewPermissions(temporary);
    expect(read(clientPath)).toBe(client);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
