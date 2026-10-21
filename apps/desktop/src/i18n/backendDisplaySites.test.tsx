// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { russian } from "../../../../shared/i18n/ru";
import { RequestSpeedButton } from "../../../../shared/remote-chat/RequestSpeedButton";
import { ResetCreditsPanel } from "../components/accounts/ResetCreditsPanel";
import { threadCopy } from "../pages/codex-threads/copy";
import { HomeMigrationError } from "../pages/codex-threads/ThreadModals/HomeMigrationError";
import { guiText, setGuiLanguage } from "./guiText";

const clipboard = vi.hoisted(() => ({ copyText: vi.fn(() => Promise.resolve()) }));
vi.mock("../utils/clipboard", () => ({ copyText: clipboard.copyText }));

// A backend message with an upstream Russian entry; the component must not show the Chinese source.
const BACKEND_MESSAGE = "无法读取配置";
const translated = russian[BACKEND_MESSAGE];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setGuiLanguage("zh");
});

describe("backend messages at desktop display sites", () => {
  it("translates the reset credits error and keeps Chinese unchanged", async () => {
    const state = { status: "error" as const, error: BACKEND_MESSAGE };
    const t = (key: string) => key;
    await act(async () => root.render(<ResetCreditsPanel state={state} onRetry={() => {}} language="ru" t={t} />));
    expect(translated).toBeTruthy();
    expect(container.textContent).toContain(translated);

    await act(async () => root.render(<ResetCreditsPanel state={state} onRetry={() => {}} language="zh" t={t} />));
    expect(container.textContent).toContain(BACKEND_MESSAGE);
  });

  it("shows the migration error in Russian and copies the original text", async () => {
    await act(async () => setGuiLanguage("ru"));
    await act(async () => root.render(<HomeMigrationError error={BACKEND_MESSAGE} text={threadCopy.ru} />));
    expect(container.textContent).toContain(translated);
    expect(container.textContent).not.toContain(BACKEND_MESSAGE);

    await act(async () => container.querySelector("button")!.click());
    expect(clipboard.copyText).toHaveBeenCalledWith(BACKEND_MESSAGE);
  });

  it("passes the speed button error through the caller's translator", async () => {
    await act(async () => setGuiLanguage("ru"));
    await act(async () => root.render(<RequestSpeedButton speed="normal" error={BACKEND_MESSAGE}
      translate={(text) => guiText(text)} onChange={() => {}} />));
    const button = container.querySelector("button")!;
    await act(async () => button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    await act(async () => button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 150)));
    expect(document.body.textContent).toContain(translated);
  });
});
