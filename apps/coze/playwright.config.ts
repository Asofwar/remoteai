import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui/e2e", testMatch: "**/*.pw.ts", workers: 1, timeout: 45_000,
  outputDir: "../../.codex-tmp/coze-canvas-playwright",
  // The editor follows the browser locale when no `lang` is given; the specs select Chinese copy.
  use: { baseURL: "http://127.0.0.1:15329", headless: true, viewport: { width: 1280, height: 800 },
    locale: "zh-CN", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node ../../node_modules/vite/bin/vite.js --config ui/vite.config.ts"
      + " --host 127.0.0.1 --port 15329 --strictPort",
    url: "http://127.0.0.1:15329", reuseExistingServer: false },
});
