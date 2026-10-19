import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'keyboard-shortcuts.pw.ts', workers: 1, timeout: 90_000,
  outputDir: '../../.codex-tmp/shortcuts-playwright',
  use: { baseURL: 'http://127.0.0.1:1493', channel: process.env.CHAT_TEST_BROWSER ?? 'msedge',
    locale: 'zh-CN', headless: true },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 1493', url: 'http://127.0.0.1:1493',
    reuseExistingServer: false },
});
