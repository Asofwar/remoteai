import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import type { BrowserHostMessage } from '../../../shared/project-browser/nativeBridge';
import type { DocumentsSnapshot } from '../../../shared/project-browser/documents';
import { browserRequest, browserRoot, savedFiles } from './project-browser-fixture';
const require = createRequire(import.meta.url);
const { handleBrowserRequest } = require('../../../shared/project-browser/nativeBridge') as
  typeof import('../../../shared/project-browser/nativeBridge');
const { createProjectBrowserClient } = require('../../../shared/project-browser/protocol') as
  typeof import('../../../shared/project-browser/protocol');

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    projectBrowserMessage: (message: BrowserHostMessage) => void;
    nativeBrowserRequest: (message: string) => Promise<void>;
  }
}

test('bundled native editor: offline assets, mobile search/fold/save and close guard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const html = readFileSync(new URL('../../native/assets/project-browser.html', import.meta.url), 'utf8');
  const client = createProjectBrowserClient(browserRequest);
  const emit = (message: BrowserHostMessage) => page.evaluate(value => window.projectBrowserMessage(value), message);
  let closed = false;
  let snapshot: DocumentsSnapshot | undefined;
  await page.exposeFunction('nativeBrowserRequest', async (raw: string) => {
    const message = JSON.parse(raw) as { type: string; snapshot?: DocumentsSnapshot };
    if (message.type === 'ready') {
      await emit({ type: 'settings', cwd: browserRoot, connected: true, labels: {}, autoSaveDelay: 0, snapshot,
        theme: { '--ink': '#e6e8eb', '--panel': '#1b201e', '--muted': '#a2aaa7',
          '--bg': '#121614', '--line': '#35413a', '--green': '#61d6ad', '--browser-on-accent': '#121614' } });
    } else if (message.type === 'closed') { closed = true; snapshot = message.snapshot; }
    else {
      const reply = await handleBrowserRequest(raw, { client, cwd: browserRoot, connected: true });
      if (reply) await emit(reply);
    }
  });
  await page.addInitScript(() => {
    window.ReactNativeWebView = { postMessage: message => { void window.nativeBrowserRequest(message); } };
  });
  await page.route('**/native-browser.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('/native-browser.html');
  await page.getByRole('treeitem', { name: 'src', exact: true }).click();
  await page.getByRole('treeitem', { name: 'main.ts', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '文件内容', exact: true });
  await expect(editor).toContainText('function');
  await page.getByRole('button', { name: '全部折叠', exact: true }).click();
  await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
  await page.getByRole('button', { name: '全部展开', exact: true }).click();
  await page.getByRole('button', { name: '查找', exact: true }).click();
  await page.getByPlaceholder('查找', { exact: true }).fill('message');
  await expect(page.locator('.cm-searchMatch')).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await editor.fill('export const 手机编辑 = true;\n');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect(savedFiles.at(-1)?.text).toBe('export const 手机编辑 = true;\n');
  await editor.fill('keep my unsaved draft');
  await page.getByRole('button', { name: '关闭文件 main.ts', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(closed).toBe(false);
  await page.screenshot({ path: '../../.codex-tmp/project-browser-native-dark.png' });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await emit({ type: 'close' });
  await expect.poll(() => closed).toBe(true);
  await page.reload();
  await expect(editor).toContainText('keep my unsaved draft');
  await expect(page.getByRole('tab', { name: 'main.ts' }).locator('.pf-dirty-dot')).toBeVisible();
  await editor.press('Control+s');
  await expect(page.getByRole('tab', { name: 'main.ts' }).locator('.pf-dirty-dot')).toHaveCount(0);
  expect(errors).toEqual([]);
});
