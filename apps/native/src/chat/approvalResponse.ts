import type { ApprovalReply, GuiEvent } from './types';

export type ApprovalDecision = NonNullable<ApprovalReply['decision']>;
export type ApprovalAnswers = Record<string, string>;

/** Validate again when pressed; native input and button events can arrive before a rerender. */
export function approvalResponse(
  event: GuiEvent, decision: ApprovalDecision, answers: ApprovalAnswers,
): ApprovalReply | null {
  if (event.id == null) return null;
  if (event.method !== 'item/tool/requestUserInput') {
    if (decision === 'accept' && event.params.availableDecisions?.includes('accept') === false) return null;
    return { id: event.id, decision };
  }
  const questions = event.params.questions ?? [];
  if (decision !== 'accept' || questions.some((question) => !answers[question.id]?.trim())) return null;
  return { id: event.id, answers: Object.fromEntries(questions.map((question) =>
    [question.id, { answers: [answers[question.id].trim()] }])) };
}
