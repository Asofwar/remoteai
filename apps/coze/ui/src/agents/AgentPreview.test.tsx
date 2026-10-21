// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import type { Resource } from "../types";
import { AgentPreview } from "./AgentPreview";
import { useAgentChat } from "./useAgentChat";

vi.mock("./useAgentChat", () => ({ useAgentChat: vi.fn() }));

const resource: Resource = { id: "agent", name: "助手", kind: "agent", description: "", draft: {},
  revision: 1, publishedRevision: null, mcpEnabled: false, updatedAt: "" };
let root: Root | undefined;
let host: HTMLElement | undefined;

function chatState(step: number): ReturnType<typeof useAgentChat> {
  return { messages: [], conversation: undefined, conversations: [], busy: true, error: "已停止生成。", live: "",
    step, traces: [{ id: "call", name: "search" }], send: vi.fn(), cancel: vi.fn(), selectConversation: vi.fn(),
    clearError: vi.fn() };
}

const text = (selector: string) => host?.querySelector(selector)?.textContent?.trim();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined,
    removeEventListener: () => undefined, dispatchEvent: () => false }));
  vi.mocked(useAgentChat).mockReturnValue(chatState(3));
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<AgentPreview resource={resource} draft={{ model: "m" }} />));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove(); root = undefined; host = undefined;
  setLanguage("zh"); vi.unstubAllGlobals(); vi.resetAllMocks();
});

it("keeps the Chinese chat status text and translates stored sources at render", async () => {
  expect(text(".ant-tag")).toBe("正在回答 · 第 3 轮");
  expect(text("summary")).toBe("本轮工具调用（1）");
  expect(text(".ant-alert-message")).toBe("已停止生成。");
  await act(async () => setLanguage("ru"));
  expect(text(".ant-tag")).toBe("Отвечает · шаг 3");
  expect(text("summary")).toBe("Вызовы инструментов в этом ходе (1)");
  expect(text(".ant-alert-message")).toBe("Генерация остановлена.");
  expect(text("details details summary")).toBe("Выполняется · search");
});

it("shows the first step without a step counter", async () => {
  vi.mocked(useAgentChat).mockReturnValue(chatState(1));
  await act(async () => setLanguage("en"));
  expect(text(".ant-tag")).toBe("Answering");
  expect(host?.querySelector("textarea")?.getAttribute("placeholder")).toBe("Type a message…");
});
