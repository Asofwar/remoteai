import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyChatEvent } from '../../../../shared/remote-chat/client/events';
import { syncChatProcessing } from '../../../../shared/remote-chat/client/processing';
import { initialChatState, type ChatState, type GuiEvent } from '../../../../shared/remote-chat/client/types';

const event = (method: string, params: GuiEvent['params'] = {}): GuiEvent => ({ method,
  params: { threadId: 'chat', turnId: 'turn', ...params } });
const start = (): ChatState => applyChatEvent({ ...initialChatState(), selected: {
  id: 'chat', cwd: '', preview: '', updatedAt: 1,
} }, event('turn/started', { turn: { id: 'turn', status: 'inProgress', startedAt: 100, items: [] } }));
const item = (state: ChatState, id: string, type: string, completed = false) => applyChatEvent(state,
  event(completed ? 'item/completed' : 'item/started', {
    item: { id, type, status: completed ? 'completed' : 'inProgress' },
  }));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => vi.useRealTimers());

it('shows the latest active command and keeps its clock stable during streamed output', () => {
  let state = start();
  expect(state.processing).toMatchObject({ phase: 'request', startedAtMs: 100_000 });
  vi.advanceTimersByTime(2000);
  state = item(state, 'first', 'commandExecution');
  vi.advanceTimersByTime(3000);
  state = item(state, 'last', 'commandExecution');
  vi.advanceTimersByTime(1000);
  state = applyChatEvent(state, event('item/commandExecution/outputDelta', { itemId: 'first', delta: 'output' }));
  expect(state.processing).toMatchObject({ id: 'last', phase: 'command', startedAtMs: 105_000 });
  state = item(state, 'first', 'commandExecution', true);
  state = item(state, 'last', 'commandExecution', true);
  expect(state.processing).toMatchObject({ phase: 'request', startedAtMs: 106_000 });
  vi.advanceTimersByTime(1000);
  state = applyChatEvent(state, event('item/commandExecution/outputDelta', { itemId: 'last', delta: 'late' }));
  expect(state.processing).toMatchObject({ phase: 'request', startedAtMs: 106_000 });
  state = applyChatEvent(state, event('item/agentMessage/delta', { itemId: 'answer', delta: 'hello' }));
  expect(state.processing).toMatchObject({ phase: 'response', startedAtMs: 107_000 });
});

it('follows desktop phases for reasoning, tools, files, search and retry', () => {
  let state = start();
  for (const [type, phase] of [['reasoning', 'reasoning'], ['mcpToolCall', 'tool'],
    ['fileChange', 'files'], ['webSearch', 'search'], ['sleep', 'wait']]) {
    state = item(state, type, type);
    expect(state.processing?.phase).toBe(phase);
    state = item(state, type, type, true);
  }
  state = applyChatEvent(state, event('error', { willRetry: true }));
  expect(state.processing?.phase).toBe('retry');
  state = item(state, 'answer', 'agentMessage');
  expect(state.processing?.phase).toBe('response');
});

it('prioritizes confirmations and input, then resumes the command after either client responds', () => {
  let state = item(start(), 'command', 'commandExecution');
  state = applyChatEvent(state, { ...event('item/commandExecution/requestApproval'), id: 1 });
  vi.advanceTimersByTime(2000);
  state = applyChatEvent(state, { ...event('item/tool/requestUserInput'), id: 2 });
  expect(state.processing?.phase).toBe('input');
  state = applyChatEvent(state, event('serverRequest/resolved', { requestId: 2 }));
  expect(state.processing?.phase).toBe('approval');
  state = syncChatProcessing({ ...state, approvals: [] }, state);
  expect(state.processing).toMatchObject({ phase: 'command', startedAtMs: 102_000 });
});

it('restores live history, preserves the phase clock, and clears completed snapshot activities', () => {
  let state = item(start(), 'command', 'commandExecution');
  vi.advanceTimersByTime(5000);
  state = syncChatProcessing({ ...state, selected: structuredClone(state.selected) }, state);
  expect(state.processing).toMatchObject({ phase: 'command', startedAtMs: 100_000 });
  const selected = structuredClone(state.selected)!;
  selected.turns![0].items[0].status = 'completed';
  state = syncChatProcessing({ ...state, selected }, state);
  expect(state.processing).toMatchObject({ phase: 'request', startedAtMs: 105_000 });
  const restored = syncChatProcessing({ ...initialChatState(), selected }, initialChatState());
  expect(restored.processing?.phase).toBe('request');
});

it('preserves pending confirmation timing across refreshed snapshots', () => {
  let state = item(start(), 'command', 'commandExecution');
  state = applyChatEvent(state, { ...event('item/commandExecution/requestApproval'), id: 1 });
  vi.advanceTimersByTime(5000);
  state = syncChatProcessing({ ...state, selected: structuredClone(state.selected) }, state);
  expect(state.processing).toMatchObject({ phase: 'approval', startedAtMs: 100_000 });
});

it('ignores other threads and old turns, and clears status on completion, disconnect or selection change', () => {
  const state = item(start(), 'command', 'commandExecution');
  for (const params of [{ threadId: 'other' }, { turnId: 'old' }]) {
    expect(applyChatEvent(state, event('error', { ...params, willRetry: true })).processing).toEqual(state.processing);
  }
  expect(applyChatEvent(state, event('turn/completed', {
    turn: { id: 'turn', status: 'completed', items: [] },
  })).processing).toBeUndefined();
  expect(applyChatEvent(state, event('connection/closed')).processing).toBeUndefined();
  expect(syncChatProcessing({ ...state, selected: null }, state).processing).toBeUndefined();
});
