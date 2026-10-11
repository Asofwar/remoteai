// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '../../api/backend';
import { subscribeGuiEvent } from '../../pages/codexGui/webEvents';
import { HelpAssistant } from './HelpAssistant';
import { helpError, messageHistory, type HelpAvailability, type HelpMessage, type HelpStatus } from './types';
import type { DashboardPage } from '../dashboard/DashboardNavigation';

vi.mock('../../api/backend', () => ({ hasLocalBackend: true, invoke: vi.fn() }));
vi.mock('../../pages/codexGui/webEvents', () => ({ subscribeGuiEvent: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const openCodex = vi.fn();
const unsubscribe = vi.fn();
let accountChanged: () => void;
let availability: HelpAvailability;
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const input = () => document.querySelector<HTMLTextAreaElement>('textarea')!;

async function render(page: DashboardPage = 'accounts') {
  await act(async () => root.render(<HelpAssistant language="zh" page={page} onOpenCodex={openCodex} />));
}
async function open() { await act(async () => button('问题解答助手').click()); }
async function type(text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function send() { await act(async () => button('发送').click()); }

beforeEach(() => {
  vi.clearAllMocks();
  availability = { status: 'ready', accountRevision: 7 };
  vi.mocked(invoke).mockImplementation(async (command) => command === 'remote_ai_help_status'
    ? availability : { text: '请打开 Codex，选择账户。', sources: ['docs/codex-gui.md'] });
  vi.mocked(subscribeGuiEvent).mockImplementation(async (_name, callback) => {
    accountChanged = () => callback({ kind: 'account', id: 'new-account' });
    return unsubscribe;
  });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('adds one quiet global launcher and preserves answers across sidebar pages', async () => {
  await render();
  expect(invoke).not.toHaveBeenCalled();
  expect(button('问题解答助手').querySelector('img')?.getAttribute('src')).toContain('assistant-icon.jpg');
  await open(); await type('怎么选择账户？'); await send();
  expect(document.body.textContent).toContain('请打开 Codex，选择账户。');
  await render('providers');
  expect(document.body.textContent).toContain('请打开 Codex，选择账户。');
  expect(document.querySelectorAll('[aria-label="问题解答助手"][role="dialog"]')).toHaveLength(1);
  expect(vi.mocked(invoke).mock.calls.find(([command]) => command === 'remote_ai_help_ask')?.[1]).toEqual({
    request: { question: '怎么选择账户？', page: 'accounts', history: [], accountRevision: 7 },
  });
});

it.each<HelpStatus>(['installRequired', 'initializeRequired', 'accountRequired'])
('guides %s to Codex without submitting a request', async (status) => {
  availability = { status };
  await render(); await open();
  expect(input().disabled).toBe(true);
  const setup = [...document.querySelectorAll('button')].find((item) => item.textContent === '前往 Codex')!;
  await act(async () => setup.click());
  expect(openCodex).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(vi.mocked(invoke).mock.calls.every(([command]) => command !== 'remote_ai_help_ask')).toBe(true);
});

it('keeps a single request running while minimized and hides remote Markdown images and links', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation((command) => command === 'remote_ai_help_status'
    ? Promise.resolve(availability) : new Promise((resolve) => { finish = resolve; }));
  await render(); await open(); await type('Remote AI 如何使用？');
  await act(async () => { button('发送').click(); button('发送').click(); });
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'remote_ai_help_ask')).toHaveLength(1);
  await act(async () => button('收起助手').click());
  await render('tokens'); await open();
  expect(document.body.textContent).toContain('正在查找答案');
  await act(async () => finish({ text: '**可以**\n![track](https://example.com/pixel)\n[link](file:///secret)', sources: [] }));
  expect(document.querySelector('[role="log"] strong')?.textContent).toBe('可以');
  expect(document.querySelector('[role="log"] img')).toBeNull();
  expect(document.querySelector('[role="log"] a')).toBeNull();
});

it('restores the draft after failure without leaking backend error details', async () => {
  await render(); await open(); await type('为什么连不上？');
  vi.mocked(invoke).mockRejectedValueOnce('upstream secret-token C:/private/config');
  await send();
  expect(input().value).toBe('为什么连不上？');
  expect(document.body.textContent).toContain('暂时没有获取到答案');
  expect(document.body.textContent).not.toContain('secret-token');
  await send();
  expect(document.body.textContent).toContain('请打开 Codex');
  await act(async () => button('新对话').click());
  expect(document.querySelector('[role="log"]')?.textContent).toBe('');
});

it('does not submit during IME composition or Shift+Enter', async () => {
  await render(); await open(); await type('你好');
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
  });
  expect(vi.mocked(invoke).mock.calls.every(([command]) => command !== 'remote_ai_help_ask')).toBe(true);
});

it('clears old-account history even when the account changes while minimized', async () => {
  await render(); await open(); await type('第一个问题'); await send();
  await act(async () => button('收起助手').click());
  expect(unsubscribe).toHaveBeenCalled();
  availability = { status: 'ready', accountRevision: 8 };
  await open();
  expect(document.querySelector('[role="log"]')?.textContent).toBe('');
  await type('第二个问题'); await send();
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'remote_ai_help_ask').at(-1)?.[1]).toEqual({
    request: { question: '第二个问题', page: 'accounts', history: [], accountRevision: 8 },
  });
});

it('discards answers from an account that changed during the request', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation((command) => command === 'remote_ai_help_status'
    ? Promise.resolve(availability) : new Promise((resolve) => { finish = resolve; }));
  await render(); await open(); await type('问题'); await send();
  availability = { status: 'ready', accountRevision: 8 };
  await act(async () => accountChanged());
  await act(async () => finish({ text: '旧账户回答', sources: [] }));
  expect(document.body.textContent).not.toContain('旧账户回答');
  expect(input().value).toBe('问题');
  expect(document.body.textContent).toContain('账户已切换');
});

it('bounds submitted history and maps unknown errors to safe copy', () => {
  const messages: HelpMessage[] = Array.from({ length: 40 }, (_, id) => ({
    id, role: id % 2 ? 'assistant' : 'user', text: '界'.repeat(8_000),
  }));
  expect(messageHistory(messages)).toHaveLength(4);
  expect(messageHistory(messages)[0]).not.toHaveProperty('id');
  expect(helpError({ message: 'secret' })).toBe('answerFailed');
  expect(helpError(new Error('accountRequired'))).toBe('accountRequired');
});
