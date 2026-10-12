// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFileDrop, type FileDropEvent, type SubscribeFileDrop } from '../../../../../shared/chat/useFileDrop';

let root: Root;
let host: HTMLDivElement;
let listener: (event: FileDropEvent) => void;
let drop: ReturnType<typeof useFileDrop>;
const addPaths = vi.fn();
const addFiles = vi.fn();
const report = vi.fn();
const stop = vi.fn();
const subscribe: SubscribeFileDrop = vi.fn(async callback => { listener = callback; return stop; });

function Fixture({ scope = 'one', active = true, disabled = false, native = true } = {}) {
  const target = useRef<HTMLDivElement>(null);
  drop = useFileDrop({ target, scope, active, disabled, subscribe: native ? subscribe : undefined,
    addPaths, addFiles, report });
  return <div ref={target} {...drop.handlers}><span>drop here</span></div>;
}
const nativeDrop = (paths = ['C:\\notes.txt']) => listener({ type: 'drop', position: { x: 200, y: 100 }, paths });
function browserEvent(type: string, files: File[] = []) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } });
  host.querySelector('span')!.dispatchEvent(event);
  return event;
}
beforeEach(async () => {
  vi.clearAllMocks(); addPaths.mockResolvedValue(undefined); addFiles.mockResolvedValue(undefined);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('devicePixelRatio', 2);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 80, top: 40, right: 120, bottom: 60, width: 40, height: 20, x: 80, y: 40, toJSON: () => ({}),
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('hit-tests scaled native coordinates and only accepts drops inside the composer', async () => {
  await act(async () => listener({ type: 'over', position: { x: 200, y: 100 } }));
  expect(drop.dragging).toBe(true);
  await act(async () => listener({ type: 'drop', paths: ['outside'], position: { x: 10, y: 10 } }));
  expect(drop.dragging).toBe(false); expect(addPaths).not.toHaveBeenCalled();
  await act(async () => nativeDrop());
  expect(addPaths).toHaveBeenCalledWith(['C:\\notes.txt'], expect.any(Function));
  expect(drop.reading).toBe(false);
});

it('blocks duplicate events during reads and ignores their results after switching drafts', async () => {
  let finish!: () => void;
  let current!: () => boolean;
  addPaths.mockImplementation((_paths, valid) => {
    current = valid; return new Promise<void>(resolve => { finish = resolve; });
  });
  await act(async () => { nativeDrop(); nativeDrop(); });
  expect(addPaths).toHaveBeenCalledTimes(1); expect(drop.reading).toBe(true);
  expect(current()).toBe(true);
  await act(async () => root.render(<Fixture scope="two" />));
  expect(current()).toBe(false); expect(drop.reading).toBe(false);
  await act(async () => finish());
  expect(report).not.toHaveBeenCalled();
});

it.each([{ active: false }, { disabled: true }])('rejects hidden or disabled composer drops: %o', async props => {
  await act(async () => root.render(<Fixture {...props} />));
  await act(async () => nativeDrop());
  expect(addPaths).not.toHaveBeenCalled();
});

it('accepts browser files once and prevents the browser from navigating to them', async () => {
  await act(async () => root.render(<Fixture native={false} />));
  const file = new File(['document'], 'notes.txt');
  await act(async () => expect(browserEvent('drop', [file]).defaultPrevented).toBe(true));
  expect(addFiles).toHaveBeenCalledWith([file]);
  expect(stop).toHaveBeenCalledOnce();
});

it('ignores the duplicate DOM drop when native events are available and reports read errors', async () => {
  await act(async () => browserEvent('drop', [new File(['document'], 'notes.txt')]));
  expect(addFiles).not.toHaveBeenCalled();
  addPaths.mockRejectedValue(new Error('read failed'));
  await act(async () => nativeDrop());
  expect(report).toHaveBeenCalledOnce(); expect(drop.reading).toBe(false);
});

it('cleans up a native subscription that resolves after unmount', async () => {
  let finish!: (stop: () => void) => void;
  const lateStop = vi.fn();
  vi.mocked(subscribe).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(<Fixture active={false} />));
  await act(async () => root.render(<Fixture />));
  await act(async () => root.render(null));
  await act(async () => finish(lateStop));
  expect(lateStop).toHaveBeenCalledOnce();
});
