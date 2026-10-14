import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'port-mapping.pw.ts', workers: 1, timeout: 45_000,
  outputDir: '../../.codex-tmp/port-mapping-web',
  use: { baseURL: 'http://127.0.0.1:1498/web/', channel: 'msedge', locale: 'zh-CN',
    headless: true, screenshot: 'only-on-failure' },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    { command: 'node ../../shared/port-mapping/testing/server.mjs', url: 'http://127.0.0.1:1496/state',
      reuseExistingServer: !process.env.CI },
    { command: 'npx vite --host 127.0.0.1 --port 1498 --strictPort', url: 'http://127.0.0.1:1498/web/',
      reuseExistingServer: !process.env.CI },
  ],
});
