// @vitest-environment jsdom
import { act, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GitDrawer } from '../../../web/src/chat/git/GitDrawer';
import { DetailsWorkspace } from '../pages/codexGui/DetailsWorkspace';
import { WorkspaceDrawerContext, workspaceTabId } from '../../../../shared/chat/workspaceDrawer';
import { ConversationChangesButton } from '../pages/codexGui/ConversationChangesButton';

vi.mock('../../../web/src/useDesktopLayout', () => ({ useDesktopLayout: () => true }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const visibility = vi.fn();
const panel = () => container.querySelector<HTMLElement>('[role="dialog"]')!;
const button = (label: string) => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
function Fixture() {
  return <DetailsWorkspace active selected="/project"><Tools /></DetailsWorkspace>;
}
function Tools() {
  const [open, setOpen] = useState(true);
  const workspace = useContext(WorkspaceDrawerContext)!;
  return <>
    <button onClick={() => workspace.tabs.open(workspaceTabId.git(''))}>打开 Git</button>
    <ConversationChangesButton />
    {open && <GitDrawer active desktopDiffs onClose={() => setOpen(false)} onVisibilityChange={visibility}>
      {() => <input aria-label="草稿" defaultValue="draft" />}</GitDrawer>}
  </>;
}
beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 48, 1400, 800));
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1400);
  localStorage.clear(); visibility.mockClear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

it('shares the conversation drawer and its width preference', async () => {
  expect(panel().closest('[data-workspace-drawers]')).not.toBeNull();
  expect(panel().style.width).toBe('560px');
  expect(container.querySelector<HTMLElement>('[style*="margin-right"]')!.style.marginRight).toBe('560px');
  expect(document.activeElement).toBe(button('关闭详情抽屉'));
  const grip = container.querySelector('[role="separator"]')!;
  await act(async () => grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(panel().style.width).toBe('536px');
  expect(localStorage.getItem('codex-switch:gui-details-width')).toBe('536');
  await act(async () => button('查看文件更改').click());
  expect(container.querySelectorAll('aside')).toHaveLength(1);
  expect(panel().style.width).toBe('536px');
  await act(async () => grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(900);
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(panel().style.width).toBe('560px');
});

it('pauses refresh when minimized or the page is hidden and preserves mounted content', async () => {
  expect(visibility).toHaveBeenLastCalledWith(true);
  await act(async () => button('最小化详情抽屉').click());
  expect(panel().hidden).toBe(true);
  expect(visibility).toHaveBeenLastCalledWith(false);
  await act(async () => [...container.querySelectorAll('button')]
    .find(node => node.textContent === 'Git' && !node.hasAttribute('role'))!.click());
  expect(panel().hidden).toBe(false);
  expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('draft');
  expect(visibility).toHaveBeenLastCalledWith(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(visibility).toHaveBeenLastCalledWith(false);
  await act(async () => button('关闭详情抽屉').click());
  expect(panel().hidden).toBe(true);
  await act(async () => [...container.querySelectorAll('button')].find(node => node.textContent === '打开 Git')!.click());
  expect(panel().hidden).toBe(false);
  expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('draft');
});

it('keeps Git mounted and pauses its refresh while another tab is selected, including Escape from a portal', async () => {
  const draft = container.querySelector('input')!;
  await act(async () => button('查看文件更改').click());
  expect(visibility).toHaveBeenLastCalledWith(false);
  expect(draft.closest<HTMLElement>('[role="tabpanel"]')?.hidden).toBe(true);
  await act(async () => container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]')!.click());
  expect(visibility).toHaveBeenLastCalledWith(true);
  await act(async () => draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(panel().hidden).toBe(true);
  expect(visibility).toHaveBeenLastCalledWith(false);
});
