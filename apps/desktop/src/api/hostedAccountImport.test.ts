// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ open: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: native.open, save: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.head.innerHTML = '<meta name="codex-switch-runtime" content="hosted">';
  sessionStorage.clear();
  sessionStorage.setItem("codex-switch:hosted-web-api-key", "test-lan-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    ok: true, result: { importedIds: ["imported-account"], skipped: [] },
  })));
});

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

it("uploads the file selected in the browser with the LAN key and no host path", async () => {
  const { chooseAndImportAccountJson } = await import("./backend");
  const pending = chooseAndImportAccountJson();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input.accept).toContain(".jsonl");
  const content = '{"tokens":{"access_token":"fixture-token"}}';
  Object.defineProperty(input, "files", { value: [{ size: content.length, text: async () => content }] });
  input.dispatchEvent(new Event("change"));
  await expect(pending).resolves.toEqual({ status: "imported", ids: ["imported-account"], skipped: [] });
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe("/__codex_switch__/api/invoke");
  expect(JSON.parse(request.body)).toEqual({ command: "import_account_json_text", args: { content } });
  expect(request.headers["X-API-Key"]).toBe("test-lan-key");
  expect(native.open).not.toHaveBeenCalled();
  expect(native.invoke).not.toHaveBeenCalled();
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

it("cleans up a cancelled file picker without sending an import", async () => {
  const { chooseAndImportAccountJson } = await import("./backend");
  const pending = chooseAndImportAccountJson();
  document.querySelector('input[type="file"]')!.dispatchEvent(new Event("cancel"));
  await expect(pending).resolves.toEqual({ status: "cancelled" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

it("rejects oversized files before reading or uploading them", async () => {
  const { chooseAndImportAccountJson } = await import("./backend");
  const pending = chooseAndImportAccountJson();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const text = vi.fn();
  Object.defineProperty(input, "files", { value: [{ size: 20 * 1024 * 1024 + 1, text }] });
  input.dispatchEvent(new Event("change"));
  await expect(pending).rejects.toThrow("20 MB");
  expect(text).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("reports import failures instead of claiming success", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "Invalid account content" })));
  const { importAccountJsonText } = await import("./backend");
  await expect(importAccountJsonText("invalid")).rejects.toThrow("Invalid account content");
});

it("sends cloud login to the hosted backend without retrieving the desktop password", async () => {
  const { loginCloud, loadSavedCloudLogin } = await import("./backend");
  await expect(loadSavedCloudLogin()).resolves.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  await loginCloud("fixture@example.invalid", "fixture-password", false);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ command: "cloud_login", args: {
    email: "fixture@example.invalid", password: "fixture-password", rememberPassword: false,
  } });
});
