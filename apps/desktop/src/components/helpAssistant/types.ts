export const MAX_QUESTION_LENGTH = 4_000;
export const MAX_HISTORY_CHARACTERS = 32_000;
export const MAX_HISTORY_MESSAGES = 12;
export type HelpStatus = 'ready' | 'installRequired' | 'initializeRequired' | 'accountRequired';
export interface HelpAvailability { status: HelpStatus; accountRevision?: number }
export type HelpError = Exclude<HelpStatus, 'ready'> | 'accountChanged' | 'invalidRequest'
  | 'busy' | 'unavailable' | 'answerFailed';
export interface HelpAnswer { text: string; sources: string[] }
export interface HelpMessage { id: number; role: 'user' | 'assistant'; text: string; sources?: string[] }

export function helpError(value: unknown): HelpError {
  const code = value instanceof Error ? value.message : value;
  const errors: HelpError[] = ['installRequired', 'initializeRequired', 'accountRequired', 'accountChanged',
    'invalidRequest', 'busy', 'unavailable', 'answerFailed'];
  return errors.find((error) => error === code) ?? 'answerFailed';
}

export function messageHistory(messages: HelpMessage[]) {
  let characters = 0;
  const history: Pick<HelpMessage, 'role' | 'text'>[] = [];
  for (const message of messages.slice(-MAX_HISTORY_MESSAGES).reverse()) {
    const length = Array.from(message.text).length;
    if (characters + length > MAX_HISTORY_CHARACTERS) break;
    characters += length;
    history.unshift({ role: message.role, text: message.text });
  }
  return history;
}
