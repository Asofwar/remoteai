// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ChatUsage } from '../../../native/src/chat/ChatUsage';
import { contextUsage } from '../../../../shared/context-usage/values.js';

vi.mock('../../../native/node_modules/react-native/index.js', () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Pressable: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  StyleSheet: { hairlineWidth: 1 },
}));
vi.mock('../../../native/node_modules/@expo/vector-icons/Feather.js', () => ({ default: () => null }));
vi.mock('../../../native/src/theme/styles', () => ({ createThemedStyles: () => () => ({}) }));
vi.mock('../../../native/src/theme/store', () => ({ useThemeColor: () => (value: string) => value }));
vi.mock('../../../native/src/i18n', () => ({ t: (text: string) => text, useLanguage: () => 'zh' }));
vi.mock('../../../native/src/chat/styles', () => ({ palette: {} }));
vi.mock('../../../native/src/chat/ConversationPerformance', () => ({ ConversationPerformance: () => null }));
vi.mock('../../../../shared/remote-chat/client/useChatUsage', () => ({ useChatUsage: () => ({ usage: null, error: '' }) }));

it('renders the same engine estimate and compaction reset on the native phone view', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  const usage = { total: { totalTokens: 8744228 }, last: { totalTokens: 206357 },
    contextTokens: 247017, modelContextWindow: 258400 };
  const render = (contextTokens: number) => act(async () => root.render(<ChatUsage active ready threadId="thread"
    tokenUsage={{ ...usage, contextTokens }} read={() => new Promise<never>(() => {})}
    readConversationMetrics={() => new Promise<never>(() => {})} />));
  try {
    await render(247017);
    expect(container.textContent).toContain('上下文 247K / 258.4K Token（96% 已用）');
    expect(container.textContent).toContain('正在读取今日用量');
    await render(16273);
    expect(container.textContent).toContain('上下文 16.3K / 258.4K Token（6% 已用）');
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it('handles older engines and invalid estimates without corrupting the display', () => {
  for (const contextTokens of [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(contextUsage({ contextTokens, last: { totalTokens: 20 }, modelContextWindow: 100 })?.used).toBe(20);
  }
  expect(contextUsage({ contextTokens: 0, last: { totalTokens: 20 }, modelContextWindow: 100 })?.percent).toBe(0);
});
