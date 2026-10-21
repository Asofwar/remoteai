// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  loadProxyTransport, saveProxyTransport, type ProxyTransportSettings,
} from "../api/proxyTransport";
import { useProxyTransport } from "./useProxyTransport";

vi.mock("../api/proxyTransport", () => ({
  DEFAULT_PROXY_TRANSPORT: { networkRetryCount: 6, maxRedirects: 10 },
  MAX_PROXY_TRANSPORT_COUNT: 0xffff_ffff,
  loadProxyTransport: vi.fn(),
  saveProxyTransport: vi.fn(),
}));
let root: Root;
let host: HTMLDivElement;
let controls: ReturnType<typeof useProxyTransport>;
const notify = vi.fn();

function Fixture() {
  controls = useProxyTransport(notify);
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTicks((value) => value + 1), 100);
    return () => window.clearInterval(timer);
  }, []);
  return <span>{ticks}</span>;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.mocked(loadProxyTransport).mockResolvedValue({ networkRetryCount: 6, maxRedirects: 10 });
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(<Fixture />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("keeps polling responsive and serializes saves while retaining the other setting", async () => {
  let complete!: (settings: ProxyTransportSettings) => void;
  vi.mocked(saveProxyTransport).mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  await act(async () => {
    void controls.updateCount("networkRetryCount", 8);
    void controls.updateCount("maxRedirects", 20);
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(saveProxyTransport).toHaveBeenCalledExactlyOnceWith({ networkRetryCount: 8, maxRedirects: 10 });
  expect(host.textContent).toBe("5");
  expect(controls.loading).toBe(true);
  await act(async () => complete({ networkRetryCount: 8, maxRedirects: 10 }));
  expect(controls.settings.networkRetryCount).toBe(8);
  expect(controls.loading).toBe(false);
  vi.mocked(saveProxyTransport).mockImplementation(async (settings) => settings);
  await act(async () => { await controls.updateCount("maxRedirects", 15); });
  expect(controls.settings).toEqual({ networkRetryCount: 8, maxRedirects: 15 });
});

it("retains settings after a failed save and accepts zero to disable retries", async () => {
  vi.mocked(saveProxyTransport).mockRejectedValueOnce(new Error("Save failed"));
  await act(async () => { await controls.updateCount("networkRetryCount", 0); });
  expect(controls.settings.networkRetryCount).toBe(6);
  expect(notify).toHaveBeenCalledWith("Error: Save failed");
  vi.mocked(saveProxyTransport).mockImplementation(async (settings) => settings);
  await act(async () => { await controls.updateCount("networkRetryCount", 0); });
  expect(controls.settings.networkRetryCount).toBe(0);
});

it("rejects empty, fractional, and out-of-range counts", async () => {
  for (const value of [null, "", "invalid", -1, 1.5, 0x1_0000_0000, Infinity]) {
    await act(async () => { await controls.updateCount("maxRedirects", value); });
  }
  expect(saveProxyTransport).not.toHaveBeenCalled();
});
