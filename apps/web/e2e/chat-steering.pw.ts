import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { Thread } from '../src/chat/types';
import { screenshot } from './chat-helpers';

const historyModule = '/web/@fs/'
  + fileURLToPath(new URL('../../../shared/remote-chat/client/history.ts', import.meta.url)).replaceAll('\\', '/');

test('keeps an unfinished answer above later supplements after refresh', async ({ page }, info) => {
  const live: Thread = { id: 'steering', cwd: '', preview: '', updatedAt: 1, turns: [{
    id: 'turn', status: 'inProgress', items: [
      { id: 'user', type: 'userMessage', text: '检查更新下载速度' },
      { id: 'partial', type: 'agentMessage', phase: 'final_answer', text: '针对 10+ MB/s，建议先补齐下载流水线。' },
      { id: 'supplement', type: 'userMessage', text: '补充：加入服务器下载源' },
      { id: 'progress', type: 'agentMessage', phase: 'commentary', text: '正在加入服务器下载源。' },
    ],
  }] };
  await page.route('**/display-fixture.json', route => route.fulfill({ json: live }));
  await page.goto('e2e/chat-display-harness.html');
  const messages = page.locator('.chat-user-message .chat-markdown, .chat-assistant-message .chat-markdown');
  const expected = live.turns![0].items.map(item => item.text!);
  await expect(messages).toHaveText(expected);
  const snapshot: Thread = { ...live, turns: [{ ...live.turns![0],
    items: live.turns![0].items.filter(item => item.id !== 'partial') }] };
  await page.evaluate(async ({ module, snapshot, live }) => {
    const { mergeHistory }: typeof import('../../../shared/remote-chat/client/history') = await import(module);
    const detail = mergeHistory(snapshot, live, live);
    window.dispatchEvent(new CustomEvent('display-fixture', { detail }));
  }, { module: historyModule, snapshot, live });
  await expect(messages).toHaveText(expected);
  await expect(page.getByText(expected.at(-1)!, { exact: true })).toBeVisible();
  await screenshot(page, info, 'steering-order-after-refresh');
});
