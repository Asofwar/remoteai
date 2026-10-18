// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkItems } from "./WorkItems";
import { ActivityWindowContext, type ActivityPager, type ActivityWindowControl } from './activityWindowContext';
import type { Item } from "./types";

let container: HTMLDivElement;
let root: Root;
let control: ActivityWindowControl;
let pagers: Set<ActivityPager>;
const command = (id: string, status = "completed"): Item => ({ id, type: "commandExecution", status,
  command: `echo ${id}`, aggregatedOutput: `output-${id}` });
const explanation = (id: string): Item => ({ id, type: "agentMessage", phase: "commentary", text: id,
  status: "completed" });
const render = (items: Item[], running = true) => act(async () => root.render(
  <ActivityWindowContext.Provider value={control}><WorkItems items={items} running={running} />
  </ActivityWindowContext.Provider>));
async function page(direction: 'older' | 'newer') {
  let loaded = false;
  await act(async () => { loaded = [...pagers].some(pager => pager(direction)); });
  return loaded;
}
async function toggle(node: HTMLDetailsElement, open = true) {
  await act(async () => { node.open = open; node.dispatchEvent(new Event("toggle")); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); root = createRoot(container);
  pagers = new Set();
  control = { viewport: { current: container }, following: false,
    register: pager => { pagers.add(pager); return () => { pagers.delete(pager); }; },
    load: update => { update(); return true; } };
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it('bounds an expanded long-running process and lets the reader browse every earlier activity', async () => {
  let items = Array.from({ length: 300 }, (_, index) => explanation(`comment-${index}`));
  await render(items);
  expect(container.querySelectorAll('[data-message-id]')).toHaveLength(50);
  expect(container.querySelector('[data-message-id="comment-299"]')).not.toBeNull();
  expect(container.querySelectorAll('button')).toHaveLength(0);
  await page('older');
  const first = container.querySelector('[data-message-id]');
  items = [...items, explanation('new')];
  await render(items);
  expect(container.querySelector('[data-message-id]')).toBe(first);
  while (await page('older')) {
    expect(container.querySelectorAll('[data-message-id]').length).toBeLessThanOrEqual(50);
  }
  expect(container.querySelector('[data-message-id="comment-0"]')).not.toBeNull();
  while (await page('newer')) {
    expect(container.querySelectorAll('[data-message-id]').length).toBeLessThanOrEqual(50);
  }
  expect(container.querySelector('[data-message-id="new"]')).not.toBeNull();
  // Consecutive tools share a disclosure, but expanding it must obey the same bound.
  await render(Array.from({ length: 300 }, (_, index) => command(`cmd-${index}`)));
  await toggle(container.querySelector('details')!);
  expect(container.querySelectorAll('[data-message-id]')).toHaveLength(50);
});

it('retains an expanded command run and overlapping command details while paging', async () => {
  await render(Array.from({ length: 100 }, (_, index) => command(`cmd-${index}`)));
  const group = container.querySelector('details')!;
  expect(group.querySelector('summary')?.getAttribute('aria-label')).toContain('全部 100 项活动');
  await toggle(group);
  const commandDetails = container.querySelector<HTMLDetailsElement>('[data-message-id="cmd-60"] details')!;
  await toggle(commandDetails);
  await page('older');
  expect(container.querySelector('details')).toBe(group);
  expect(group.open).toBe(true);
  expect(container.querySelector('[data-message-id="cmd-60"] details')).toBe(commandDetails);
  expect(commandDetails.open).toBe(true);
  expect(container.querySelector('[data-message-id="cmd-25"]')).not.toBeNull();
});

it('skips a collapsed command run to reach earlier explanations', async () => {
  await render([explanation('before'), ...Array.from({ length: 300 }, (_, index) => command(`cmd-${index}`))]);
  await page('older');
  expect(container.querySelector('[data-message-id="before"]')).not.toBeNull();
  expect(container.querySelectorAll('[data-message-id]')).toHaveLength(1);
  expect(container.querySelector('summary')?.textContent).toBe('已运行 echo cmd-299');
});

it('keeps a reading window stable during streaming and resets it when following resumes', async () => {
  const items = Array.from({ length: 100 }, (_, index) => explanation(`comment-${index}`));
  await render(items);
  await render([...items, explanation('new')]);
  expect(container.querySelector('[data-message-id="comment-50"]')).not.toBeNull();
  expect(container.querySelector('[data-message-id="new"]')).toBeNull();
  control = { ...control, following: true };
  await render([...items, explanation('new')]);
  expect(container.querySelector('[data-message-id="new"]')).not.toBeNull();
});

it("shows one latest running operation while preserving explanations on either side", async () => {
  await render([explanation("before"), command("first"),
    { id: "edit", type: "fileChange", changes: [{ path: "sample.txt", kind: { type: "update" }, diff: "edit" }] },
    command("latest", "inProgress"), explanation("after")]);
  expect(container.textContent).toContain("before");
  expect(container.textContent).toContain("after");
  expect(container.textContent).toContain("正在运行 echo latest");
  expect(container.textContent).not.toContain("echo first");
  expect(container.textContent).not.toContain("sample.txt");
  expect(container.querySelectorAll("details")).toHaveLength(1);
  expect(container.querySelector("summary")?.getAttribute("aria-label")).toContain("全部 3 项活动");
  await toggle(container.querySelector("details")!);
  expect(container.querySelectorAll("[data-activity-group] [data-message-id]")).toHaveLength(3);
  expect(container.textContent).toContain("sample.txt");
  expect(container.textContent).not.toContain("output-first");
  await toggle(container.querySelector('[data-message-id="first"] details')!);
  expect(container.textContent).toContain("output-first");
});

it("retains expanded history and command details while new commands arrive and the turn completes", async () => {
  await render([command("first"), command("second", "inProgress")]);
  const group = container.querySelector("details")!;
  await toggle(group);
  const first = container.querySelector<HTMLDetailsElement>('[data-message-id="first"] details')!;
  await toggle(first);
  await render([command("first"), command("second"), command("third", "inProgress")]);
  expect(container.querySelector("details")).toBe(group);
  expect(container.querySelector('[data-message-id="first"] details')).toBe(first);
  expect(first.open).toBe(true);
  expect(group.open).toBe(true);
  expect(group.querySelector("summary")?.textContent).toContain("正在运行 echo third");
  await render([command("first"), command("second"), command("third")], false);
  expect(group.open).toBe(true);
  expect(group.querySelector("summary")?.textContent).toContain("已运行 echo third");
  await toggle(group, false);
  expect(container.querySelector('[data-message-id="first"]')).toBeNull();
});

it("prefers the last running command even if a later operation finishes first", async () => {
  await render([command("first", "inProgress"), command("second", "inProgress"), command("third")]);
  expect(container.querySelector("summary")?.textContent).toBe("正在运行 echo second");
  await render([command("first"), command("second"), command("third", "failed")], false);
  expect(container.querySelector("summary")?.textContent).toBe("运行失败 echo third");
});

it("keeps separate runs on either side of reasoning and messages", async () => {
  await render([command("one"), command("two"), { id: "reason", type: "reasoning", summary: ["检查边界"] },
    command("three"), command("four"), explanation("next"), command("single")]);
  expect(container.querySelectorAll("[data-activity-group]")).toHaveLength(2);
  expect(container.querySelector('[data-message-id="reason"]')).not.toBeNull();
  expect(container.querySelector('[data-message-id="single"]')).not.toBeNull();
  expect(container.textContent).toContain("next");
});
