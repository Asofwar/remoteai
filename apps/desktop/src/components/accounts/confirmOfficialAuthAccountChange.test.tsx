// @vitest-environment jsdom
import { Modal } from "antd";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Translate } from "../../i18n";
import { confirmOfficialAuthAccountChange } from "./confirmOfficialAuthAccountChange";
import { AccountAvatar } from "./AccountAvatar";

const t = ((key: string) => key) as Translate;
const onConfirm = vi.fn();
const getComputedStyle = window.getComputedStyle.bind(window);

beforeEach(() => {
  vi.useFakeTimers();
  // JSDOM cannot measure the scrollbar pseudo-element requested by Ant Design.
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
  onConfirm.mockReset();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(async () => {
  await act(async () => {
    Modal.destroyAll();
    await vi.runAllTimersAsync();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function requestChange(accountId: string | null, currentAccountId: string | null = null) {
  await act(async () => {
    confirmOfficialAuthAccountChange({ accountId, currentAccountId, onConfirm, t });
    await vi.runAllTimersAsync();
  });
}

function dialogButton(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".ant-modal button"))
    .find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing dialog button: ${label}`);
  return button;
}

it("keeps the login unchanged until the red confirmation button is clicked", async () => {
  await requestChange("official-account");
  expect(onConfirm).not.toHaveBeenCalled();
  const confirmButton = dialogButton("providers.proxy.openaiAuthConfirmButton");
  expect(confirmButton.classList.contains("ant-btn-dangerous")).toBe(true);
  expect(confirmButton.classList.contains("ant-btn-primary")).toBe(true);
  expect(document.querySelector(".compact-confirm-copy")?.textContent)
    .toBe("providers.proxy.openaiAuthConfirmDescription");

  await act(async () => confirmButton.click());
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith("official-account");
});

it("does not change the login when the user cancels", async () => {
  await requestChange("another-official-account");
  await act(async () => dialogButton("table.cancel").click());
  expect(onConfirm).not.toHaveBeenCalled();
});

it("clears the official login only after confirmation", async () => {
  await requestChange(null, "official-account");
  expect(onConfirm).not.toHaveBeenCalled();
  expect(document.querySelector(".compact-confirm-copy")?.textContent)
    .toBe("providers.proxy.openaiAuthClearDescription");
  await act(async () => dialogButton("providers.proxy.openaiAuthClearButton").click());
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(null);
});

it("keeps the official login when cancellation is dismissed", async () => {
  await requestChange(null, "official-account");
  await act(async () => dialogButton("table.cancel").click());
  expect(onConfirm).not.toHaveBeenCalled();
});

it("switches an existing official login to another account without confirmation", async () => {
  await requestChange("another-official-account", "official-account");
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith("another-official-account");
  expect(document.querySelector(".ant-modal")).toBeNull();
});

it.each(["table", "card"] as const)("the %s avatar confirms cancellation without switching the row", async (variant) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const onRowClick = vi.fn();
  try {
    await act(async () => root.render(
      <div onClick={onRowClick}>
        <AccountAvatar email="user@example.com" disabled={false} officialAuthActive busy={false}
          variant={variant} t={t} onClearOfficialAuth={() => confirmOfficialAuthAccountChange({
            accountId: null, currentAccountId: "official-account", onConfirm, t,
          })} />
      </div>,
    ));
    expect(container.textContent).toBe("table.loginState");
    await act(async () => {
      container.querySelector("button")!.click();
      await vi.runAllTimersAsync();
    });
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    await act(async () => dialogButton("providers.proxy.openaiAuthClearButton").click());
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(null);
  } finally {
    await act(async () => root.unmount());
  }
});
