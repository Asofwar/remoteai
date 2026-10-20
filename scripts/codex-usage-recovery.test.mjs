import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { chromium, expect } from "@playwright/test";

const root = new URL("../apps/desktop/src-tauri/src/dream_skin_native/", import.meta.url);
const [sync, overlay, queryClient, status] = await Promise.all([
  "renderer_sync.rs", "speed_selector_overlay.rs", "composer_query_client.js", "composer_status.js",
].map(path => readFile(new URL(path, root), "utf8")));
const substitutions = {
  query_client: queryClient,
  overlay: overlay.slice(overlay.indexOf('r#"') + 3, overlay.lastIndexOf('"#;'))
    .replace("__CODEX_SWITCH_SERVICE_TIER__", '"default"'),
  status,
};
const template = sync.match(/r#"(\(\(\) => \{\{[\s\S]*?\}\}\)\(\))"#/)[1];
const restore = template.replace(/\{\{|\}\}|\{([a-z_]+)\}/g, (token, key) => {
  if (token === "{{") return "{";
  if (token === "}}") return "}";
  assert.ok(Object.hasOwn(substitutions, key));
  return substitutions[key];
});
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function loadComposer(page) {
  await page.setContent(`<div contenteditable="true" aria-label="Message"></div>
    <div><div><div><button data-composer-navigation-target="reasoning">Model</button></div></div></div>`);
  await page.evaluate(() => {
    window.subscriptions = new Set();
    const query = { queryKey: ["models", "list", "local", "chatgpt"], isActive: () => true };
    const cache = {
      getAll: () => [query],
      subscribe: listener => {
        window.subscriptions.add(listener);
        return () => window.subscriptions.delete(listener);
      },
    };
    const client = { getQueryCache: () => cache, invalidateQueries() {}, setQueryData() {} };
    window.__codexRoot = { _internalRoot: { current: { memoizedProps: { client } } } };
    window.summary = { enabled: true, totalTokens: 4790000, estimatedCostUsd: 12, primaryRemainingPercent: 90 };
    window.codexSwitchRequestUsageSummary = () => {
      if (window.summary) window.__CODEX_SWITCH_SPEED_SELECTOR__?.updateUsage(window.summary);
    };
  });
}

test("restores a missing composer on reattachment and reload without a model refresh", async () => {
  const page = await browser.newPage();
  try {
    for (let reload = 0; reload < 2; reload += 1) {
      await page.goto("about:blank");
      await loadComposer(page);
      await page.locator("[contenteditable]").fill("Keep this draft");
      assert.equal(await page.evaluate(restore), true);
      await expect(page.locator("[data-today-tokens]")).toHaveText("4.79M");
      await expect(page.locator("[data-trailing-balance]")).toHaveText("90%");
      await page.evaluate(restore);
      await expect(page.locator("[data-codex-switch-speed-selector]")).toHaveCount(1);
      assert.equal(await page.evaluate(() => window.subscriptions.size), 1);
      await expect(page.locator("[contenteditable]")).toHaveText("Keep this draft");
      await expect(page.locator("[data-speed-controls]")).toBeHidden();
    }
  } finally {
    await page.close();
  }
});

test("typing stays responsive during an unanswered refresh and stale data recovers", async () => {
  const page = await browser.newPage();
  try {
    await page.clock.install();
    await loadComposer(page);
    await page.evaluate(restore);
    await page.clock.runFor(1);
    await expect(page.locator("[data-today-tokens]")).toHaveText("4.79M");
    await page.evaluate(() => { window.summary = null; });
    await page.clock.fastForward(35000);
    await expect(page.locator("[data-today-cost]")).toHaveText("待更新");
    await expect(page.locator("[data-trailing-balance]")).toBeHidden();
    await page.locator("[contenteditable]").fill("Typing while synchronization is pending");
    await page.evaluate(() => {
      window.summary = { enabled: true, totalTokens: 5000000, estimatedCostUsd: 13, primaryRemainingPercent: 89 };
      window.__CODEX_SWITCH_SPEED_SELECTOR__.completeUsageRequest();
      window.__CODEX_SWITCH_SPEED_SELECTOR__.requestUsage();
    });
    await expect(page.locator("[data-today-tokens]")).toHaveText("5M");
    await expect(page.locator("[data-trailing-balance]")).toHaveText("89%");
    await expect(page.locator("[contenteditable]")).toHaveText("Typing while synchronization is pending");
  } finally {
    await page.close();
  }
});
