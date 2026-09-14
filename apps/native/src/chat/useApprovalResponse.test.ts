import { beforeEach, expect, it, vi } from 'vitest';
import { useApprovalResponse } from './useApprovalResponse';

const observed = vi.hoisted(() => ({ updates: [] as unknown[] }));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [initial, (value: unknown) => observed.updates.push(value)],
}));
beforeEach(() => { observed.updates = []; });
const event = { id: 'request', method: 'item/commandExecution/requestApproval', params: {} };

it('blocks a second native press before React can rerender and permits retry after failure', async () => {
  let reject: (reason: Error) => void = () => undefined;
  const respond = vi.fn().mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }))
    .mockResolvedValue(undefined);
  const approval = useApprovalResponse({ event, answers: {}, respond });
  const first = approval.send('accept');
  await approval.send('decline');
  expect(respond).toHaveBeenCalledTimes(1);
  reject(new Error('Bearer secret-private-token'));
  await first;
  expect(observed.updates).toEqual([true, '', '提交失败，请重试。', false]);
  await approval.send('decline');
  expect(respond).toHaveBeenLastCalledWith({ id: 'request', decision: 'decline' });
  expect(observed.updates.slice(-3)).toEqual([true, '', false]);
});

it('does not submit incomplete answers even when an input return event bypasses a disabled button', async () => {
  const respond = vi.fn();
  const approval = useApprovalResponse({ event: { ...event, method: 'item/tool/requestUserInput', params: {
    questions: [{ id: 'question', header: 'Question', question: 'What should change?' }],
  } }, answers: { question: ' ' }, respond });
  await approval.send('accept');
  expect(respond).not.toHaveBeenCalled();
  expect(observed.updates).toEqual([]);
});
