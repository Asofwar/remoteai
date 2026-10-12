// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ImageAiContext } from '../../../../../shared/chat/ImageAiContext';
import { useImageAiEdit } from '../../../../../shared/chat/useImageAiEdit';
import { imageAiPrompt } from '../../../../../shared/chat/imageAiEdit';
import { imageAiSender } from '../../../../../shared/remote-chat/client/imageAiSender';
import { initialChatState } from '../../../../../shared/remote-chat/client/types';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const host = document.createElement('div');
const root = createRoot(host);
let editor: ReturnType<typeof useImageAiEdit>;
function Harness({ load, close }: { load: () => Promise<string>; close: () => void }) {
  editor = useImageAiEdit({ load, close }); return null;
}
afterEach(async () => { await act(async () => root.render(null)); });

it('rejects missing edit details and invalid pixel dimensions', () => {
  for (const tool of ['annotate', 'comment', 'erase'] as const) {
    expect(() => imageAiPrompt({ tool, detail: ' ', width: '', height: '' })).toThrow('请填写');
  }
  for (const width of ['0', '-1', '1.2', '1e3', '16385']) {
    expect(() => imageAiPrompt({ tool: 'resize', detail: '', width, height: '100' })).toThrow('整数');
  }
  expect(imageAiPrompt({ tool: 'background', detail: '', width: '', height: '' })).toContain('透明背景 PNG');
});

it('keeps the dialog on failure and prevents overlapping submissions', async () => {
  let finish: (image: string) => void = () => {};
  const load = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const close = vi.fn(); const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  await act(async () => root.render(<ImageAiContext.Provider value={{ enabled: true, send }}>
    <Harness load={load} close={close} /></ImageAiContext.Provider>));
  await act(async () => editor.select('background'));
  let first: Promise<void>;
  await act(async () => { first = editor.submit(); void editor.submit(); });
  expect(load).toHaveBeenCalledOnce();
  await act(async () => { finish('original'); await first; });
  expect(close).not.toHaveBeenCalled(); expect(editor.error).toContain('未能提交');
  await act(async () => { first = editor.submit(); });
  await act(async () => { finish('original'); await first; });
  expect(send).toHaveBeenLastCalledWith(expect.stringContaining('透明背景'), 'original');
  expect(close).toHaveBeenCalledOnce();
});

it('does not submit after the preview closes while the original is loading', async () => {
  let finish: (image: string) => void = () => {};
  const send = vi.fn();
  await act(async () => root.render(<ImageAiContext.Provider value={{ enabled: true, send }}>
    <Harness load={() => new Promise(resolve => { finish = resolve; })} close={vi.fn()} />
  </ImageAiContext.Provider>));
  await act(async () => editor.select('background'));
  let request: Promise<void>;
  await act(async () => { request = editor.submit(); });
  await act(async () => root.render(null));
  await act(async () => { finish('original'); await request; });
  expect(send).not.toHaveBeenCalled();
});

it('does not send to a different conversation after image preparation', async () => {
  let state = initialChatState();
  state = { ...state, ready: true, selected: { id: 'first', cwd: '', preview: '', updatedAt: 0 } };
  const send = vi.fn();
  const submit = imageAiSender({ snapshot: () => state, send }, async source => source);
  state = { ...state, selected: { ...state.selected!, id: 'second' } };
  expect(await submit('edit', 'original')).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
