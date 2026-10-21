import { defineConfig } from '@playwright/test';
import { basePath } from './site.config.mjs';

export default defineConfig({
  testDir: './e2e',
  workers: 2,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:4175${basePath}`,
    channel: process.env.WEBSITE_TEST_BROWSER || (process.platform === 'win32' ? 'msedge' : undefined),
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: `http://127.0.0.1:4175${basePath}`,
    reuseExistingServer: !process.env.CI,
  },
});
