import { test, expect } from "@playwright/test";
import { MODEL_CATALOG_TIMEOUT_MS } from "../src/pages/codexGui/modelCatalogTimeout";
import { modelSettingsBackend } from "./model-settings-backend";

for (const width of [1280, 390]) {
  test(`loads an empty cache only on explicit retry while polling remains responsive at ${width}px`, async ({ page }) => {
    const backend = modelSettingsBackend();
    backend.emptyModels(true);
    await backend.attach(page.context());
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto("/e2e/model-settings-harness.html", { waitUntil: "domcontentloaded" });
      const retry = page.getByRole("button", { name: "暂无可用模型，点击重试", exact: true });
      await expect(retry).toBeEnabled();
      expect(backend.discoveryRequests()).toBe(0);
      const beats = Number(await page.getByLabel("刷新次数").textContent());
      await page.getByRole("textbox", { name: "聊天消息" }).fill("网络恢复后继续");
      await expect(page.getByRole("button", { name: "发送消息", exact: true })).toBeDisabled();
      backend.emptyModels(false);
      await retry.click();
      await expect(page.getByRole("button", { name: /^模型与推理强度/ })).toContainText("模型一", { timeout: 10_000 });
      await expect(page.getByRole("button", { name: "发送消息", exact: true })).toBeEnabled();
      await expect.poll(async () => Number(await page.getByLabel("刷新次数").textContent())).toBeGreaterThan(beats);
      await expect(page.getByText("正在刷新用量")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "聊天消息" })).toHaveValue("网络恢复后继续");
      expect(backend.modelRequests()).toBeGreaterThan(1);
    } finally { backend.releaseUsage(); }
  });

  test(`retains cached models after an empty refresh while usage polling continues at ${width}px`, async ({ page }) => {
    const backend = modelSettingsBackend();
    await backend.attach(page.context());
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto("/e2e/model-settings-harness.html", { waitUntil: "domcontentloaded" });
      const picker = page.getByRole("button", { name: /^模型与推理强度/ });
      await expect(picker).toContainText("模型一");
      await page.getByRole("textbox", { name: "聊天消息" }).fill("保留模型后继续");
      const beats = Number(await page.getByLabel("刷新次数").textContent());
      backend.emptyModels(true);
      await picker.click();
      expect(backend.discoveryRequests()).toBe(0);
      await page.getByRole("slider", { name: "推理强度" }).press("Escape");
      await page.getByRole("button", { name: "刷新模型", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("模型列表暂时无法更新");
      await expect(picker).toContainText("模型一");
      await expect(picker).toBeEnabled();
      await expect(page.getByRole("button", { name: "发送消息", exact: true })).toBeEnabled();
      await expect.poll(async () => Number(await page.getByLabel("刷新次数").textContent())).toBeGreaterThan(beats);
      await expect(page.getByText("正在刷新用量")).toBeVisible();
      backend.emptyModels(false);
      backend.addModel("恢复后的模型");
      await page.getByRole("button", { name: "刷新模型", exact: true }).click();
      await picker.click();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.getByRole("button", { name: "选择模型", exact: true }).click();
      await expect(page.getByRole("menuitemradio", { name: "恢复后的模型" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "聊天消息" })).toHaveValue("保留模型后继续");
      await page.screenshot({ path: `../../.codex-tmp/model-empty-${width}.png`, animations: "disabled" });
    } finally { backend.releaseUsage(); }
  });

  test(`retries stalled model loading while usage polling remains responsive at ${width}px`, async ({ page }) => {
    const backend = modelSettingsBackend();
    backend.pauseModels();
    await page.clock.install();
    await backend.attach(page.context());
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto("/e2e/model-settings-harness.html", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "正在加载模型…", exact: true })).toBeDisabled();
      await expect.poll(backend.modelRequests).toBe(1);
      const beats = Number(await page.getByLabel("刷新次数").textContent());
      await page.getByRole("textbox", { name: "聊天消息" }).fill("加载完成后继续");
      await expect.poll(async () => Number(await page.getByLabel("刷新次数").textContent())).toBeGreaterThan(beats);
      await page.clock.fastForward(120_000);
      await expect(page.getByRole("button", { name: "正在加载模型…", exact: true })).toBeDisabled();
      expect(backend.modelRequests()).toBe(1);
      await page.clock.fastForward(MODEL_CATALOG_TIMEOUT_MS - 120_000 + 50);
      const retry = page.getByRole("button", { name: "模型加载失败，点击重试", exact: true });
      await expect(retry).toBeEnabled();
      await expect(page.getByRole("button", { name: "发送消息", exact: true })).toBeDisabled();
      await expect(page.getByText("正在刷新用量")).toBeVisible();
      await page.screenshot({ path: `../../.codex-tmp/model-retry-${width}.png`, animations: "disabled" });
      backend.releaseModels();
      await retry.click();
      await expect(page.getByRole("button", { name: /^模型与推理强度/ })).toContainText("模型一");
      await expect(page.getByRole("button", { name: "发送消息", exact: true })).toBeEnabled();
      await expect(page.getByRole("textbox", { name: "聊天消息" })).toHaveValue("加载完成后继续");
      expect(backend.sends).toHaveLength(0);
    } finally { backend.releaseModels(); backend.releaseUsage(); }
  });
}

for (const width of [1280, 390]) {
  test("cached connections, picker and running sessions stay passive at " + width + "px", async ({ page }) => {
    const backend = modelSettingsBackend();
    await page.clock.install();
    await backend.attach(page.context());
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto("/e2e/model-settings-harness.html", { waitUntil: "domcontentloaded" });
      const picker = page.getByRole("button", { name: /^模型与推理强度/ });
      await expect(picker).toContainText("模型一");
      await page.getByRole("button", { name: "对话 a", exact: true }).click();
      backend.startTurn("a");
      await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
      const beats = Number(await page.getByLabel("刷新次数").textContent());
      for (let index = 0; index < 2; index++) {
        await picker.click();
        await expect(page.getByRole("slider", { name: "推理强度" })).toBeEnabled();
        await page.getByRole("slider", { name: "推理强度" }).press("Escape");
      }
      await page.clock.fastForward(24 * 60 * 60 * 1000);
      await expect.poll(async () => Number(await page.getByLabel("刷新次数").textContent())).toBeGreaterThan(beats);
      await expect(page.getByText("正在刷新用量")).toBeVisible();
      await page.getByRole("textbox", { name: "聊天消息" }).fill("会话运行时仍可输入");
      await page.getByRole("button", { name: "重连", exact: true }).click();
      await expect.poll(backend.modelRequests).toBe(2);
      await expect(picker).toContainText("模型一");
      expect(backend.discoveryRequests()).toBe(0);
    } finally { backend.releaseUsage(); }
  });
}

for (const width of [1280, 390]) {
  test("exposes manual retry after a reconnect cache failure at " + width + "px", async ({ page }) => {
    const backend = modelSettingsBackend();
    await page.clock.install();
    await backend.attach(page.context());
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto("/e2e/model-settings-harness.html", { waitUntil: "domcontentloaded" });
      const picker = page.getByRole("button", { name: /^模型与推理强度/ });
      await expect(picker).toContainText("模型一");
      await page.getByRole("textbox", { name: "聊天消息" }).fill("重连后继续");
      backend.failCache();
      await page.getByRole("button", { name: "重连", exact: true }).click();
      const retry = page.getByRole("button", { name: "模型加载失败，点击重试", exact: true });
      await expect(retry).toBeEnabled();
      await expect(page.getByRole("button", { name: "发送消息", exact: true })).toBeDisabled();
      await page.clock.fastForward(24 * 60 * 60 * 1000);
      expect(backend.modelRequests()).toBe(2);
      expect(backend.discoveryRequests()).toBe(0);
      await retry.click();
      await expect(picker).toContainText("模型一");
      await expect(page.getByRole("button", { name: "发送消息", exact: true })).toBeEnabled();
      await expect(page.getByRole("textbox", { name: "聊天消息" })).toHaveValue("重连后继续");
      expect(backend.discoveryRequests()).toBe(1);
    } finally { backend.releaseUsage(); }
  });
}
