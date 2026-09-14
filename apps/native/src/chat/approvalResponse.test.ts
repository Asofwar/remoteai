import { expect, it } from 'vitest';
import { approvalResponse } from './approvalResponse';
import type { GuiEvent } from './types';

const event: GuiEvent = { id: 0, method: 'item/tool/requestUserInput', params: { questions: [
  { id: 'choice', header: 'Choice', question: 'Choose one' },
  { id: 'detail', header: 'Detail', question: 'Tell us more' },
] } };

it('keeps question IDs and trims complete answers without changing the approval protocol', () => {
  expect(approvalResponse(event, 'accept', { choice: ' First ', detail: '\nDetails\n' })).toEqual({
    id: 0, answers: { choice: { answers: ['First'] }, detail: { answers: ['Details'] } },
  });
});

it('rejects incomplete questions, missing request IDs and unavailable acceptance', () => {
  expect(approvalResponse(event, 'accept', { choice: 'First', detail: '  ' })).toBeNull();
  expect(approvalResponse(event, 'decline', { choice: 'First', detail: 'Details' })).toBeNull();
  expect(approvalResponse({ ...event, id: undefined }, 'accept', {})).toBeNull();
  expect(approvalResponse({ id: 'permission', method: 'item/permissions/requestApproval',
    params: { availableDecisions: ['cancel'] } }, 'accept', {})).toBeNull();
});

it('preserves accept, decline and cancel for command and permissions requests', () => {
  const permission: GuiEvent = { id: 'permission', method: 'item/permissions/requestApproval', params: {} };
  for (const decision of ['accept', 'decline', 'cancel'] as const) {
    expect(approvalResponse(permission, decision, {})).toEqual({ id: 'permission', decision });
  }
});
