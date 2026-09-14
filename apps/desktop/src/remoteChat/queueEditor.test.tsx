// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useQueueEditor } from '../../../../shared/remote-chat/client/useQueueEditor';
import { useQueueSelection } from '../../../../shared/remote-chat/client/useQueueSelection';
import type { QueueDraft, QueueMessage } from '../../../../shared/remote-chat/queue';

let root: Root;
let options: Parameters<typeof useQueueEditor>[0];
let editor: ReturnType<typeof useQueueEditor>;
let selection: ReturnType<typeof useQueueSelection>;
let messages: QueueMessage[];
function Harness() {
  editor = useQueueEditor(options);
  selection = useQueueSelection(messages, false);
  return null;
}
const render = async () => { await act(async () => root.render(<Harness />)); };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
  messages = ['first', 'second'].map((id) => ({ id, text: id, imageCount: 0, attachmentCount: 0, busy: false }));
  options = { threadId: 'chat', disabled: false, restore: vi.fn(), queue: {
    messages, running: true, disabled: false, act: vi.fn(), take: vi.fn(),
  } };
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it('keeps the same message selected when its position changes', async () => {
  await render();
  expect(selection.selected.id).toBe('first');
  expect(selection.canMoveUp).toBe(false);
  messages = [...messages].reverse();
  await render();
  expect(selection.selected.id).toBe('first');
  expect(selection.canMoveUp).toBe(true);
  expect(selection.canMoveDown).toBe(false);
});

it('fetches only once and defers restoration after switching chats or while a draft exists', async () => {
  let finish!: (message: QueueDraft) => void;
  vi.mocked(options.queue!.take).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  let pending!: Promise<void>;
  await act(async () => { pending = editor.edit('first'); void editor.edit('first'); });
  expect(options.queue!.take).toHaveBeenCalledTimes(1);
  const restore = options.restore;
  options = { ...options, threadId: 'other' };
  await render();
  const message = { text: 'complete text', images: [], skills: [] };
  await act(async () => { finish(message); await pending; });
  expect(restore).not.toHaveBeenCalled();
  options = { ...options, threadId: 'chat', disabled: true };
  await render();
  expect(restore).not.toHaveBeenCalled();
  options = { ...options, disabled: false };
  await render();
  expect(restore).toHaveBeenCalledExactlyOnceWith(message);
});
