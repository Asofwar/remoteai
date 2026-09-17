// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
const fetchMock = vi.fn();
const writeText = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.head.innerHTML = '<meta name="codex-switch-runtime" content="hosted">';
  sessionStorage.clear();
  sessionStorage.setItem("codex-switch:hosted-web-api-key", "web-access-key");
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it("copies only the selected proxy key to the browser with authenticated access", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: "proxy-secret" })));
  const { copyLocalProxyLanApiKey } = await import("./localProxyLanKeys");
  await copyLocalProxyLanApiKey("key-two");
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe("/__codex_switch__/api/invoke");
  expect(request.headers["X-API-Key"]).toBe("web-access-key");
  expect(JSON.parse(request.body)).toEqual({ command: "copy_local_proxy_lan_api_key", args: { id: "key-two" } });
  expect(writeText).toHaveBeenCalledWith("proxy-secret");
  expect(native.invoke).not.toHaveBeenCalled();
});

it("does not copy when the selected key was removed", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "Key no longer exists" })));
  const { copyLocalProxyLanApiKey } = await import("./localProxyLanKeys");
  await expect(copyLocalProxyLanApiKey("missing")).rejects.toThrow("Key no longer exists");
  expect(writeText).not.toHaveBeenCalled();
});

it("keeps desktop copying on the native clipboard", async () => {
  document.head.innerHTML = "";
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  try {
    const { copyLocalProxyLanApiKey } = await import("./localProxyLanKeys");
    await copyLocalProxyLanApiKey("key-two");
    expect(native.invoke).toHaveBeenCalledWith("copy_local_proxy_lan_api_key", { id: "key-two" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  } finally {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  }
});

it("copies the web access key in the browser and exposes hosted management controls", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: "web-secret" })));
  const { copyWebProxyLanApiKey, canManageCodexConnection } = await import("./backend");
  expect(canManageCodexConnection).toBe(true);
  await copyWebProxyLanApiKey();
  expect(writeText).toHaveBeenCalledWith("web-secret");
  expect(native.invoke).not.toHaveBeenCalled();
});
