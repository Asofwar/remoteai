import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: /(?:image-ai|local-image-preview)\.pw\.ts/, workers: 1, timeout: 30_000,
  outputDir: '../../.codex-tmp/image-ai-playwright',
  use: { baseURL: 'http://127.0.0.1:1495', channel: 'msedge', locale: 'zh-CN', headless: true },
  webServer: { command: 'npx vite build --config vite.image-ai.config.ts'
    + ' && npx vite preview --config vite.image-ai.config.ts --host 127.0.0.1 --port 1495',
    url: 'http://127.0.0.1:1495/e2e/image-ai-harness.html',
    reuseExistingServer: !process.env.CI },
});
