import { expect, it, vi } from 'vitest';
import { AsyncAnswers } from '../../../../shared/remote-chat/client/asyncAnswers';
import {
  asyncAnswerText, enqueuedAnswerId, pendingQuestions, questionMessageText,
} from '../../../../shared/remote-chat/client/asyncQuestions';
import { initialChatState, type ChatState, type Item } from './types';
import { queueTextPreview, type QueueMessage, type QueueSnapshot } from '../../../../shared/remote-chat/queue';

const question: Item = { id: 'ask', type: 'agentMessage', delivery: 'async',
  questions: [{ title: '在哪个系统？', options: ['Windows', 'Android'] }] };
const answerText = asyncAnswerText(question, ['Android'])!;
const message = (id: string, text = answerText): QueueMessage =>
  ({ id, text: queueTextPreview(text), imageCount: 0, attachmentCount: 0, busy: false });
const queue = (messages: QueueMessage[]): QueueSnapshot => ({ revision: 1, threads: { chat: messages } });

function harness(running = true) {
  let state: ChatState = { ...initialChatState(), ready: true, selected: { id: 'chat', cwd: '', preview: '', updatedAt: 1,
    turns: [{ id: 'turn', status: running ? 'inProgress' : 'completed', items: [question] }] } };
  const request = vi.fn<(body: Record<string, unknown>) => Promise<unknown>>();
  const refresh = vi.fn<() => Promise<void>>(async () => {});
  const sender = new AsyncAnswers({ snapshot: () => state,
    request: request as ConstructorParameters<typeof AsyncAnswers>[0]['request'], refresh,
    update: (patch) => { state = { ...state, ...patch }; }, applyQueue: (snapshot) => { state = { ...state, queue: snapshot }; } });
  const acknowledge = () => {
    state = { ...state, selected: { ...state.selected!, turns: [{ ...state.selected!.turns![0],
      items: [...state.selected!.turns![0].items, { id: 'confirmed', type: 'userMessage',
        content: [{ type: 'text', text: answerText }] }] }] } };
  };
  return { sender, request, refresh, acknowledge, state: () => state,
    update: (patch: Partial<ChatState>) => { state = { ...state, ...patch }; } };
}

it('sends the precise item from its enqueue response despite concurrent broadcasts and identical older text', async () => {
  const test = harness();
  const older = message('older-identical');
  test.request.mockImplementation(async (body) => {
    if (body.operation === 'queueEnqueue') {
      const response = queue([older, message('this-answer')]);
      test.update({ queue: queue([older, message('concurrent-broadcast')]) });
      return response;
    }
    expect(body).toEqual({ operation: 'queueSendNow', threadId: 'chat', id: 'this-answer' });
    test.acknowledge();
    return queue([older, message('concurrent-broadcast')]);
  });
  expect(await test.sender.submit(question, ['Android'])).toBe(true);
  expect(test.state().queue.threads.chat.map((entry) => entry.id)).toEqual(['older-identical', 'concurrent-broadcast']);
  expect(pendingQuestions(test.state().selected)).toEqual([]);
});

it('lets an idle PC send the answer normally without steering or flushing other messages again', async () => {
  const test = harness(false);
  test.request.mockImplementation(async (body) => {
    expect(body.operation).toBe('queueEnqueue');
    return queue([{ ...message('this-answer'), busy: true }]);
  });
  test.refresh.mockImplementation(async () => test.acknowledge());
  expect(await test.sender.submit(question, ['Android'])).toBe(true);
  expect(test.request).toHaveBeenCalledTimes(1);
});

it('rejects incomplete or answered questions and blocks repeated presses while acknowledgement is pending', async () => {
  const test = harness();
  expect(await test.sender.submit(question, [' '])).toBe(false);
  expect(test.request).not.toHaveBeenCalled();
  let finish: (snapshot: QueueSnapshot) => void = () => undefined;
  test.request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  test.refresh.mockImplementation(async () => test.acknowledge());
  const first = test.sender.submit(question, ['Android']);
  expect(await test.sender.submit(question, ['Windows'])).toBe(false);
  finish(queue([{ ...message('this-answer'), busy: true }]));
  expect(await first).toBe(true);
  expect(await test.sender.submit(question, ['Android'])).toBe(false);
  expect(test.request).toHaveBeenCalledTimes(1);
});

it('retries failed sends using the same queue ID without enqueueing a second copy', async () => {
  const test = harness();
  let sends = 0;
  test.request.mockImplementation(async (body) => {
    if (body.operation === 'queueEnqueue' || body.operation === 'queueRead') return queue([message('this-answer')]);
    expect(body).toEqual({ operation: 'queueSendNow', threadId: 'chat', id: 'this-answer' });
    if (++sends === 1) return queue([{ ...message('this-answer'), error: 'Send failed' }]);
    test.acknowledge();
    return queue([]);
  });
  expect(await test.sender.submit(question, ['Android'])).toBe(false);
  expect(test.state().error).toBe('回答发送失败，请重试。');
  expect(await test.sender.submit(question, ['Android'])).toBe(true);
  expect(test.request.mock.calls.filter(([body]) => body.operation === 'queueEnqueue')).toHaveLength(1);
  expect(sends).toBe(2);
});

it('does not guess an ID or enqueue twice when the enqueue response is lost or mismatched', async () => {
  for (const response of [null, queue([message('unexpected', 'Another message')])]) {
    const test = harness();
    if (response) test.request.mockResolvedValue(response);
    else test.request.mockRejectedValue(new Error('Response lost'));
    expect(await test.sender.submit(question, ['Android'])).toBe(false);
    expect(await test.sender.submit(question, ['Android'])).toBe(false);
    expect(test.request).toHaveBeenCalledTimes(1);
    expect(test.state().error).toContain('待发送消息');
  }
});

it('never sends unrelated messages after a queued answer is removed or modified elsewhere', async () => {
  for (const remaining of [message('other'), message('this-answer', 'Edited elsewhere')]) {
    const test = harness();
    test.request.mockResolvedValueOnce(queue([message('this-answer')])).mockRejectedValueOnce(new Error('Disconnected'));
    expect(await test.sender.submit(question, ['Android'])).toBe(false);
    test.request.mockResolvedValue(queue([remaining]));
    expect(await test.sender.submit(question, ['Android'])).toBe(false);
    expect(test.request.mock.calls.filter(([body]) => body.operation === 'queueSendNow')).toHaveLength(1);
    expect(test.request.mock.calls.filter(([body]) => body.operation === 'queueEnqueue')).toHaveLength(1);
  }
});

it('waits for the original chat after a selection change and retries its existing answer only', async () => {
  const test = harness();
  const original = test.state().selected;
  test.request.mockImplementationOnce(async () => {
    test.update({ selected: { id: 'other-chat', cwd: '', preview: '', updatedAt: 1 } });
    return queue([message('this-answer')]);
  });
  expect(await test.sender.submit(question, ['Android'])).toBe(false);
  expect(test.request).toHaveBeenCalledTimes(1);
  test.update({ selected: original });
  test.request.mockImplementation(async (body) => {
    if (body.operation === 'queueRead') return queue([message('this-answer')]);
    expect(body).toEqual({ operation: 'queueSendNow', threadId: 'chat', id: 'this-answer' });
    test.acknowledge();
    return queue([]);
  });
  expect(await test.sender.submit(question, ['Android'])).toBe(true);
  expect(test.request.mock.calls.filter(([body]) => body.operation === 'queueEnqueue')).toHaveLength(1);
});

it('validates long answer previews and refuses enqueue responses carrying unrelated attachments', () => {
  const text = 'Long answer '.repeat(200);
  expect(enqueuedAnswerId(queue([message('this-answer', text)]), 'chat', text)).toBe('this-answer');
  const attached = { ...message('this-answer'), attachmentCount: 1 };
  expect(() => enqueuedAnswerId(queue([attached]), 'chat', answerText)).toThrow();
  expect(() => enqueuedAnswerId(queue([message('')]), 'chat', answerText)).toThrow();
});

it('preserves question-only transcripts and dismisses only the question answered by a structured reply', () => {
  expect(questionMessageText(question)).toBe('在哪个系统？\n- Windows\n- Android');
  expect(questionMessageText({ ...question, text: '在哪个系统？\n- Windows\n- Android' }))
    .toBe('在哪个系统？\n- Windows\n- Android');
  const test = harness();
  const second = { ...question, id: 'other', questions: [{ title: '需要保留哪些文件？' }] };
  test.update({ selected: { ...test.state().selected!, turns: [{ id: 'turn', status: 'completed', items: [question, second,
    { id: 'answer', type: 'userMessage', content: [{ type: 'text', text: answerText }] }] }] } });
  expect(pendingQuestions(test.state().selected).map((item) => item.id)).toEqual(['other']);
});
