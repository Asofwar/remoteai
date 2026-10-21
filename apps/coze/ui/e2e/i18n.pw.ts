import { expect, test, type Frame, type Page } from "@playwright/test";
import type { Graph, Resource } from "../src/types";

/**
 * Mocked user data is Chinese on purpose: it must stay as written in every language.
 * None of these strings is a dictionary key, so a leftover Chinese label cannot hide behind them.
 */
const USER_DATA = ["甲乙流程", "甲乙提示", "甲节点", "乙节点", "丙节点", "甲乙说明", "甲乙模板说明", "甲乙模板"];

const graph: Graph = {
  inputs: [{ name: "text", description: "甲乙说明", kind: "string", required: true }],
  nodes: [
    { id: "start", name: "甲节点", type: "start", x: 30, y: 70 },
    { id: "answer", name: "乙节点", type: "template", template: "{{input.text}}", x: 300, y: 70 },
    { id: "end", name: "丙节点", type: "end", value: "{{answer.output}}", x: 570, y: 70 },
  ],
  edges: [{ source: "start", target: "answer" }, { source: "answer", target: "end" }],
};
const resource = (id: string, kind: Resource["kind"], name: string, draft: Resource["draft"]): Resource =>
  ({ id, kind, name, description: "", draft, revision: 1, publishedRevision: null, mcpEnabled: false, updatedAt: "" });
const workflow = resource("i18n-workflow", "workflow", "甲乙流程", JSON.parse(JSON.stringify(graph)));
const prompt = resource("i18n-prompt", "prompt", "甲乙提示", { text: "" });

/** Answers the editor API by method; anything else is recorded and fails the test at the end. */
async function mockApi(page: Page) {
  const unexpected: string[] = [];
  const results: Record<string, unknown> = {
    access_info: { role: "owner" },
    list_resources: [workflow, prompt],
    models: [{ id: "local-model", name: "local-model" }],
    releases: [],
    tool_service_status: { settings: { enabled: false, mode: "local", port: 15461 }, urls: [] },
    list_access: [],
    // The runtime sends the built-in entry in Chinese; the UI translates only built-in entries.
    list_templates: [
      { id: "builtin-knowledge-assistant", name: "知识问答助手",
        description: "从资料库回答问题，附上可追溯的引用。选择模型并导入资料后即可使用。", builtin: true },
      { id: "mine", name: "甲乙模板", description: "甲乙模板说明", builtin: false },
    ],
    // A persisted Rust error: the runtime area of the dictionary translates it.
    runs: [{ id: "run-1", status: "failed", output: null, error: "上次运行已中断。", trace: [],
      createdAt: "2026-10-20T08:30:00Z" }],
  };
  await page.route("**/api", async (route) => {
    const { method } = route.request().postDataJSON() as { method: string };
    if (Object.prototype.hasOwnProperty.call(results, method)) await route.fulfill({ json: results[method] });
    else {
      unexpected.push(method);
      await route.fulfill({ status: 404, json: { error: `Unexpected API call: ${method}` } });
    }
  });
  return unexpected;
}

/** Visible text, placeholders, aria-labels and titles that still contain Chinese after removing user data. */
async function chineseLeft(target: Page | Frame): Promise<string[]> {
  return target.evaluate((allowed) => {
    const han = /\p{Script=Han}/u;
    const texts = document.body.innerText.split("\n");
    for (const element of document.querySelectorAll<HTMLElement>("[placeholder], [aria-label], [title]")) {
      if (!element.checkVisibility()) continue;
      for (const name of ["placeholder", "aria-label", "title"]) texts.push(element.getAttribute(name) ?? "");
    }
    return texts.map((text) => allowed.reduce((rest, item) => rest.split(item).join(""), text))
      .filter((text) => han.test(text));
  }, USER_DATA);
}

const copy = {
  ru: {
    locale: "ru-RU", agents: "Агенты", noAgents: "Пока нет агентов", workflows: "Рабочие процессы",
    newWorkflow: "Создать рабочий процесс", create: "Создать", cancel: "Отмена", ok: "OK",
    addNode: "Добавить узел", searchNodes: "Поиск узлов", knowledgeNode: "Поиск в базе знаний",
    closeNode: "Закрыть настройки узла", inputPort: "Входная точка узла «乙节点»",
    history: "История запусков", failed: "Ошибка", interrupted: "Предыдущий запуск прерван.",
    testRun: "Тестовый запуск", sample: /Привет/, settings: "Настройки", delete: "Удалить",
    confirmDelete: "Удалить? Это действие нельзя отменить.", back: "Назад",
    discard: "Сбросить несохранённые изменения?", gallery: "Галерея шаблонов",
    builtin: "Помощник по базе знаний", remove: "Убрать", removeTemplate: "Убрать из галереи шаблонов?",
    backup: "Резервные копии",
  },
  en: {
    locale: "en-US", agents: "Agents", noAgents: "No agents yet", workflows: "Workflows",
    newWorkflow: "New workflow", create: "Create", cancel: "Cancel", ok: "OK",
    addNode: "Add node", searchNodes: "Search nodes", knowledgeNode: "Knowledge retrieval",
    closeNode: "Close node settings", inputPort: "乙节点 input port",
    history: "Run history", failed: "Failed", interrupted: "The previous run was interrupted.",
    testRun: "Test run", sample: /Hello/, settings: "Settings", delete: "Delete",
    confirmDelete: "Delete? This can't be undone.", back: "Back",
    discard: "Discard unsaved changes?", gallery: "Template gallery",
    builtin: "Knowledge Q&A assistant", remove: "Remove", removeTemplate: "Remove from the template gallery?",
    backup: "Backup and restore",
  },
} as const;

/** antd Popconfirm/Modal buttons come from the ConfigProvider locale, not from the Coze dictionaries. */
async function expectPopconfirm(page: Page, title: string, text: (typeof copy)["ru" | "en"], confirm = false) {
  const popconfirm = page.locator(".ant-popconfirm:visible");
  await expect(popconfirm).toContainText(title);
  await expect(popconfirm.locator(".ant-popconfirm-buttons button")).toHaveText([text.cancel, text.ok]);
  expect(await chineseLeft(page)).toEqual([]);
  await popconfirm.getByRole("button", { name: confirm ? text.ok : text.cancel, exact: true }).click();
  await expect(popconfirm).toHaveCount(0);
}

for (const language of ["ru", "en"] as const) {
  test(`shows the studio, workflow editor and dialogs in ${language} without Chinese copy`, async ({ page }) => {
    const text = copy[language];
    const unexpected = await mockApi(page);
    await page.goto(`/#lang=${language}`);
    await expect(page.locator("html")).toHaveAttribute("lang", text.locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text.agents);
    await expect(page.getByText(text.noAgents, { exact: true })).toBeVisible();
    expect(await chineseLeft(page)).toEqual([]);

    // Resource list and the create dialog.
    await page.getByRole("button", { name: text.workflows, exact: true }).click();
    await expect(page.getByRole("button", { name: /甲乙流程/ })).toBeVisible();
    await page.getByRole("button", { name: text.newWorkflow, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(text.newWorkflow);
    await expect(dialog.getByRole("button", { name: text.create, exact: true })).toBeVisible();
    expect(await chineseLeft(page)).toEqual([]);
    await dialog.getByRole("button", { name: text.cancel, exact: true }).click();
    await expect(dialog).toBeHidden();

    // Workflow editor: canvas, node palette and inspector.
    await page.getByRole("button", { name: /甲乙流程/ }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    await expect(page.getByLabel(text.inputPort, { exact: true })).toBeVisible();
    expect(await chineseLeft(page)).toEqual([]);
    await page.locator('.react-flow__node[data-id="answer"]').click();
    await expect(page.locator(".node-inspector")).toBeVisible();
    expect(await chineseLeft(page)).toEqual([]);
    await page.getByRole("button", { name: text.closeNode }).click();
    // A new node may land on top of the existing ones, so it is added after they were inspected.
    await page.getByRole("button", { name: text.addNode, exact: true }).click();
    await expect(page.getByRole("textbox", { name: text.searchNodes })).toBeVisible();
    expect(await chineseLeft(page)).toEqual([]);
    await page.getByRole("button", { name: text.knowledgeNode, exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(4);
    await expect(page.locator(".node-inspector")).toContainText(text.knowledgeNode);
    expect(await chineseLeft(page)).toEqual([]);
    await page.getByRole("button", { name: text.closeNode }).click();
    await expect(page.locator(".node-inspector")).toHaveCount(0);

    // Run history shows a translated status and a translated persisted runtime error.
    await page.getByRole("button", { name: text.history, exact: true }).click();
    const drawer = page.locator(".ant-drawer-content");
    await drawer.locator("summary").first().click();
    await expect(drawer).toContainText(text.failed);
    await expect(drawer).toContainText(text.interrupted);
    expect(await chineseLeft(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await page.getByRole("button", { name: text.testRun, exact: true }).click();
    await expect(drawer.locator("textarea")).toHaveValue(text.sample);
    expect(await chineseLeft(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // Settings tab and the antd Popconfirm buttons.
    await page.getByRole("tab", { name: text.settings, exact: true }).click();
    await expect(page.getByText("#甲乙流程", { exact: true })).toBeVisible();
    expect(await chineseLeft(page)).toEqual([]);
    await page.getByRole("button", { name: text.delete, exact: true }).click();
    await expectPopconfirm(page, text.confirmDelete, text);

    // The added node made the draft dirty: leaving asks first.
    await page.getByRole("button", { name: text.back, exact: true }).click();
    await expectPopconfirm(page, text.discard, text, true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text.workflows);

    // Template gallery: built-in entries are translated, user templates stay as written.
    await page.getByRole("button", { name: text.gallery, exact: true }).click();
    const gallery = page.getByRole("dialog");
    await expect(gallery.getByRole("heading", { name: text.builtin })).toBeVisible();
    await expect(gallery.getByRole("heading", { name: "甲乙模板", exact: true })).toBeVisible();
    expect(await chineseLeft(page)).toEqual([]);
    await gallery.getByRole("button", { name: text.remove, exact: true }).click();
    await expectPopconfirm(page, text.removeTemplate, text);
    await gallery.locator(".ant-modal-close").click();
    await expect(gallery).toBeHidden();

    await page.getByRole("button", { name: text.backup, exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(text.backup);
    expect(await chineseLeft(page)).toEqual([]);
    expect(unexpected).toEqual([]);
  });
}

test("follows a live language switch from the desktop without losing an unsaved edit", async ({ page, baseURL }) => {
  const unexpected = await mockApi(page);
  // A desktop stand-in that frames the editor the way the desktop app does.
  const desktop = `${baseURL}/desktop-host`;
  await page.route(desktop, (route) => route.fulfill({ contentType: "text/html", body:
    `<!doctype html><script>window.received = []; addEventListener("message", (e) => received.push(e.data));</script>`
    + `<iframe src="${baseURL}/#lang=ru" style="width:1240px;height:760px;border:0"></iframe>` }));
  await page.goto(desktop);
  const frame = page.frameLocator("iframe");
  const editor = page.frames().find((item) => item !== page.mainFrame());
  if (!editor) throw new Error("Editor frame missing");
  const post = (language?: string, busy = false) => page.evaluate(([language, busy]) => {
    document.querySelector("iframe")?.contentWindow?.postMessage(
      { type: "remoteai:coze:state", busy, language }, "*");
  }, [language, busy] as const);

  await frame.getByRole("button", { name: "Промпты", exact: true }).click();
  await frame.getByRole("button", { name: /甲乙提示/ }).click();
  const draft = frame.locator(".resource-editor textarea");
  await draft.fill("Черновик, который нельзя потерять");
  await expect(frame.getByRole("button", { name: "Сохранить", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { received: unknown[] }).received))
    .toContain("remoteai:coze:ready");

  await post("en");
  await expect(frame.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(frame.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(frame.getByRole("button", { name: "Stop Coze", exact: true })).toBeVisible();
  await expect(draft).toHaveValue("Черновик, который нельзя потерять");
  expect(await editor.evaluate(() => sessionStorage.getItem("coze-language"))).toBe("en");

  // The antd locale follows too, even for an open Popconfirm.
  await frame.getByRole("button", { name: "Back", exact: true }).click();
  const popconfirm = frame.locator(".ant-popconfirm:visible");
  await expect(popconfirm).toContainText("Discard unsaved changes?");
  await expect(popconfirm.locator(".ant-popconfirm-buttons button")).toHaveText(["Cancel", "OK"]);
  await post("ru");
  await expect(popconfirm).toContainText("Сбросить несохранённые изменения?");
  await expect(popconfirm.locator(".ant-popconfirm-buttons button")).toHaveText(["Отмена", "OK"]);
  await popconfirm.getByRole("button", { name: "Отмена" }).click();
  await expect(draft).toHaveValue("Черновик, который нельзя потерять");

  // Only the parent window may switch the language, and only to a supported one. The busy state
  // without a language arrives after the ignored messages, so its Russian label proves they were handled.
  await editor.evaluate(() => window.postMessage({ type: "remoteai:coze:state", busy: false, language: "en" }, "*"));
  await post("xx");
  await post(undefined, true);
  await expect(frame.getByRole("button", { name: "Остановить Coze", exact: true })).toContainText("Остановка…");
  await expect(frame.getByRole("button", { name: "Сохранить", exact: true })).toBeEnabled();
  expect(await chineseLeft(editor)).toEqual([]);
  expect(unexpected).toEqual([]);
});
