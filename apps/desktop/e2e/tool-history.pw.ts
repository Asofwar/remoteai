import { test, expect } from "@playwright/test";
import type { Conversation, Item } from "../src/pages/codexGui/types";

const screenshot = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQKsAAAAASUVORK5CYII=";
const output = "工具输出内容 ".repeat(150_000);
const items: Item[] = [
  { id: "question", type: "userMessage", content: [{ type: "text", text: "检查截图和日志" }] },
  { id: "capture", type: "mcpToolCall", tool: "capture", status: "completed", arguments: { window: "demo" },
    result: { content: [{ type: "image", mimeType: "image/png", data: screenshot }],
      structuredContent: { description: "窗口信息 ".repeat(30_000) } } },
  { id: "long", type: "mcpToolCall", tool: "read_log", status: "completed",
    result: { content: [{ type: "text", text: output }] } },
  { id: "answer", type: "agentMessage", phase: "final_answer", text: "检查完成。" },
];
const fixture: Conversation = { thread: { id: "heavy", cwd: "", preview: "", updatedAt: 1 },
  activeTurn: null, tokens: 0, error: "", turns: [{ id: "turn", status: "completed", items }] };

test("defers closed history and appends long tool output as the mouse scrolls", async ({ page }) => {
  await page.route("**/history-fixture.json", (route) => route.fulfill({ json: fixture }));
  await page.goto("/e2e/tool-history-harness.html");
  await expect(page.getByText("检查完成。", { exact: true })).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.locator("pre")).toHaveCount(0);
  const process = page.locator("summary[data-history-anchor]");
  await process.click();
  await page.locator('[data-activity-group="capture"] > details > summary').click();
  await expect(page.locator('[data-message-id="capture"]')).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
  await page.locator('[data-message-id="capture"] > details > summary').click();
  await expect(page.getByAltText("工具返回的图片")).toHaveCount(1);
  await expect(page.locator("pre")).toHaveCount(0);
  await page.getByText("结构化结果", { exact: true }).click();
  expect((await page.locator("pre").textContent())!.length).toBeLessThanOrEqual(8_000);
  await page.locator('[data-message-id="long"] > details > summary').click();
  const log = page.locator('[data-message-id="long"]');
  const content = log.getByRole("region", { name: "工具内容" });
  await expect(content).toHaveText(output.slice(0, 8_000));
  await expect(log.getByRole("button", { name: "下一段", exact: true })).toHaveCount(0);
  expect((await log.textContent())!.length).toBeLessThan(8_200);
  await content.hover();
  await page.mouse.wheel(0, 20_000);
  await expect(content).toHaveText(output.slice(0, 16_000));
  expect(await content.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.mouse.wheel(0, -20_000);
  await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBe(0);
  await expect(content).toHaveText(output.slice(0, 16_000));
  await page.getByLabel("消息", { exact: true }).fill("展开日志后仍可输入");
  await expect(page.getByLabel("消息", { exact: true })).toHaveValue("展开日志后仍可输入");
  await page.screenshot({ path: "../../.codex-tmp/tool-output-scroll.png", animations: "disabled" });
  await process.click();
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.locator("pre")).toHaveCount(0);
  await page.getByRole("button", { name: "离开对话" }).click();
  await page.getByRole("button", { name: "返回对话" }).click();
  await expect(page.getByText("检查完成。", { exact: true })).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
});

test("mouse scrolling reads a command's complete output without paging or losing earlier lines", async ({ page }) => {
  const commandOutput = Array.from({ length: 1600 }, (_, index) => `line ${index}: command output\n`).join("");
  const command: Item = { id: "command", type: "commandExecution", status: "inProgress",
    command: "print diagnostic lines", aggregatedOutput: commandOutput };
  const conversation: Conversation = { ...fixture, turns: [{ id: "turn", status: "inProgress", items: [command] }] };
  await page.route("**/history-fixture.json", (route) => route.fulfill({ json: conversation }));
  await page.goto("/e2e/tool-history-harness.html");
  const process = page.locator("summary[data-history-anchor]");
  if (!(await process.evaluate((node) => (node.parentElement as HTMLDetailsElement).open))) await process.click();
  const activity = page.locator('[data-message-id="command"] > details');
  await activity.locator(":scope > summary").click();
  const preview = activity.locator(":scope > summary > span");
  expect(await preview.evaluate((node) => getComputedStyle(node).animationName)).toContain("activeTextSweep");
  const output = activity.getByRole("region", { name: "工具内容" }).nth(1);
  await expect(output).toHaveText(commandOutput.slice(0, 8_000));
  await expect(activity.getByRole("button", { name: "下一段", exact: true })).toHaveCount(0);
  for (let loaded = 8_000; loaded < commandOutput.length; loaded += 8_000) {
    await output.hover();
    await page.mouse.wheel(0, 100_000);
    await expect(output).toHaveText(commandOutput.slice(0, loaded + 8_000));
  }
  await page.mouse.wheel(0, -100_000);
  await expect.poll(() => output.evaluate((node) => node.scrollTop)).toBe(0);
  expect(await output.textContent()).toBe(commandOutput);
  await page.screenshot({ path: "../../.codex-tmp/command-output-scroll.png", animations: "disabled" });
});
