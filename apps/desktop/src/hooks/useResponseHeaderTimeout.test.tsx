// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  loadResponseHeaderTimeout, saveResponseHeaderTimeout, type ResponseHeaderTimeoutSettings,
} from "../api/responseHeaderTimeout";
import { useResponseHeaderTimeout } from "./useResponseHeaderTimeout";

vi.mock("../api/responseHeaderTimeout", () => ({
  DEFAULT_RESPONSE_HEADER_TIMEOUT: { timeoutSeconds: 600 },
  MAX_RESPONSE_HEADER_TIMEOUT_SECONDS: 3600,
  loadResponseHeaderTimeout: vi.fn(),
  saveResponseHeaderTimeout: vi.fn(),
}));
let root: Root;
let host: HTMLDivElement;
let controls: ReturnType<typeof useResponseHeaderTimeout>;
const notify = vi.fn();

function Fixture() {
  controls = useResponseHeaderTimeout(notify);
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
  vi.mocked(loadResponseHeaderTimeout).mockResolvedValue({ timeoutSeconds: 600 });
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

it("keeps polling responsive and prevents overlapping saves", async () => {
  let complete!: (settings: ResponseHeaderTimeoutSettings) => void;
  vi.mocked(saveResponseHeaderTimeout).mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  await act(async () => {
    void controls.updateSeconds(900);
    void controls.updateSeconds(1200);
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(saveResponseHeaderTimeout).toHaveBeenCalledExactlyOnceWith({ timeoutSeconds: 900 });
  expect(host.textContent).toBe("5");
  expect(controls.loading).toBe(true);
  await act(async () => complete({ timeoutSeconds: 900 }));
  expect(controls.settings.timeoutSeconds).toBe(900);
  expect(controls.loading).toBe(false);
});

it("retains the saved wait after a failed save and allows retry", async () => {
  vi.mocked(saveResponseHeaderTimeout).mockRejectedValueOnce(new Error("Save failed"));
  await act(async () => { await controls.updateSeconds(900); });
  expect(controls.settings.timeoutSeconds).toBe(600);
  expect(notify).toHaveBeenCalledWith("Error: Save failed");
  vi.mocked(saveResponseHeaderTimeout).mockResolvedValueOnce({ timeoutSeconds: 1200 });
  await act(async () => { await controls.updateSeconds(1200); });
  expect(controls.settings.timeoutSeconds).toBe(1200);
});

it("rejects empty, fractional, and out-of-range values", async () => {
  for (const value of [null, "", "invalid", 0, -1, 1.5, 3601, Infinity]) {
    await act(async () => { await controls.updateSeconds(value); });
  }
  expect(saveResponseHeaderTimeout).not.toHaveBeenCalled();
});
