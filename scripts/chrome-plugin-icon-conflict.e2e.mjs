import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { launchExtensionTest } from './lib/chrome-extension-test.mjs';

const source = path.resolve('apps/desktop/src-tauri/resources/chrome-extension');
const root = path.resolve('.codex-tmp', `chrome-icon-conflict-${Date.now()}`);
const extension = path.join(root, 'extension');
const profile = path.join(root, 'profile');
await fs.mkdir(profile, { recursive: true });
await fs.cp(source, extension, { recursive: true });
await fs.writeFile(path.join(extension, 'background.js'), `
import { execute } from './operations.js';
import { initializePermissions } from './permissions.js';
const ready = initializePermissions();
globalThis.run = async (operation, args) => { await ready; return execute({clientId:'fixture'}, {operation,args}); };
chrome.runtime.onInstalled.addListener(()=>{});
`);
// A previous extension world can keep observing a document after the extension is reloaded/uninstalled.
// Reproduce its original favicon ownership in a separate world from the current extension's script.
const content = `<title>Icon conflict fixture</title><link rel="icon" href="data:image/svg+xml,old-icon">
<button>Page remains responsive</button><script>
const icon = document.querySelector('link[rel="icon"]');
new MutationObserver(() => {
  for (const node of document.querySelectorAll('link[rel="icon"]')) if (node !== icon) node.remove();
  if (!icon.isConnected) document.head.append(icon);
}).observe(document.head, {childList:true,subtree:true});
</script>`;
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(content);
}).listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await launchExtensionTest({
    executable: process.env.CSW_CHROME_TEST_BROWSER ?? chromium.executablePath(), extension, profile,
    extensionId: (await fs.readFile(path.join(source, 'extension-id.txt'), 'utf8')).trim(),
  });
  const { evaluate } = browser;
  await evaluate('chrome.windows.create({url:"about:blank",focused:false,state:"minimized"})');
  const url = `http://127.0.0.1:${server.address().port}/`;
  const tab = await evaluate(`run('open',${JSON.stringify({ url })})`);
  const started = Date.now();
  const snapshot = await evaluate(`run('wait',{tabId:${tab.tabId},text:'Page remains responsive'})`);
  assert.ok(snapshot.text.includes('Page remains responsive'));
  assert.ok(Date.now() - started < 5000, 'favicon observers must not block page reads');
  await evaluate(`run('reload',{tabId:${tab.tabId}})`);
  const again = await evaluate(`run('wait',{tabId:${tab.tabId},text:'Page remains responsive'})`);
  assert.ok(again.text.includes('Page remains responsive'));
  const result = await evaluate(`run('finish',{tabIds:[${tab.tabId}]})`);
  assert.deepEqual(result.failedTabIds, []);
  assert.deepEqual(result.closedTabIds, [tab.tabId]);
  console.log('Passed competing favicon observers: snapshot, reload and cleanup remain responsive.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
