// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { formatDate, setLanguage } from "../i18n";
import type { Resource } from "../types";
import { ExternalToolsPanel } from "./ExternalToolsPanel";

vi.mock("../api", () => ({ api: vi.fn(), errorText: (error: unknown) => String(error) }));

const resource: Resource = { id: "agent", name: "Склад", kind: "agent", description: "", draft: {},
  revision: 1, publishedRevision: 1, mcpEnabled: true, updatedAt: "" };
const expiresAt = "2099-01-02T12:00:00Z";
let root: Root | undefined;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // antd List subscribes to breakpoints; jsdom has no matchMedia.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn() }));
  vi.mocked(api).mockImplementation(async (method: string) => {
    if (method === "tool_service_status") {
      return { settings: { enabled: true, mode: "local", port: 15461 }, urls: ["http://127.0.0.1:15461"] };
    }
    if (method === "list_access") {
      return [{ id: "key", name: "Client", role: "tool", expiresAt, revokedAt: null }];
    }
    throw new Error(`Unexpected API call: ${method}`);
  });
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); setLanguage("zh");
});

const mention = () => [...host.querySelectorAll("p")].find((item) => item.querySelector("strong"));

it("places the Codex GUI mention inside the translated sentence and keeps the Chinese text", async () => {
  setLanguage("ru");
  await act(async () => root?.render(<ExternalToolsPanel resource={resource} />));
  expect(mention()?.textContent).toBe("Введите #Склад в Codex GUI и выберите результат, чтобы использовать его в чате.");
  expect(mention()?.querySelector("strong")?.textContent).toBe("#Склад");
  expect(host.textContent).toContain(`Действует до ${formatDate(expiresAt)}`);
  expect(host.textContent).not.toMatch(/\p{Script=Han}/u);

  await act(async () => setLanguage("zh"));
  expect(mention()?.textContent).toBe("在 Codex GUI 中输入 #Склад 并选择，即可在对话中调用。");
  expect(host.textContent).toContain(`有效期至 ${formatDate(expiresAt)}`);
});

it("localizes only the sample value in the HTTP request example", async () => {
  setLanguage("en");
  await act(async () => root?.render(<ExternalToolsPanel resource={resource} />));
  const tab = [...host.querySelectorAll<HTMLElement>("[role=tab]")].find((item) => item.textContent === "HTTP API");
  await act(async () => tab?.click());
  const request = [...host.querySelectorAll("textarea")].map((item) => item.value).find((value) => value.startsWith("POST"));
  expect(request).toContain('"message": "Hello"');
  expect(host.textContent).toContain("This key automatically selects “Склад”.");
});
