import { useRef, useState } from 'react';
import { MessageCircle, Trash2 } from 'lucide-react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { pendingQuestions } from '../../../../shared/remote-chat/client/asyncQuestions';
import type { Item, Thread } from './types';
import { useDismissedQuestions } from './useDismissedQuestions';

interface Props {
  thread: Thread | null; disabled: boolean; error: string;
  scope: string;
  answer: (item: Item, answers: string[]) => Promise<boolean>;
}
function QuestionCard({ item, disabled, error, answer, onDelete }: Omit<Props, 'thread' | 'scope'> & {
  item: Item; onDelete: () => void;
}) {
  const questions = item.questions ?? [];
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState(() => questions.map(question => question.options?.[0] ?? ''));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current || disabled || answers.some(value => !value.trim())) return;
    submitting.current = true; setBusy(true); setFailure('');
    try {
      if (await answer(item, answers)) setOpen(false);
      else setFailure('回答尚未确认，请查看发送进度或稍后重试。');
    } catch { setFailure('回答发送失败，请重试。'); }
    finally { submitting.current = false; setBusy(false); }
  };
  const update = (index: number, value: string) => setAnswers(previous =>
    previous.map((entry, position) => position === index ? value : entry));
  return <>
    <div className="chat-question-entry">
      <button type="button" className="chat-question-open" onClick={() => setOpen(true)}
        aria-label={`回答补充问题：${questions[0]?.title ?? ''}`}><MessageCircle size={19} />
        <span className="chat-grow"><strong>需要你的补充</strong><small className="chat-ellipsis">
          {questions[0]?.title}</small></span><span>回答 ›</span></button>
      <button type="button" className="chat-question-delete" aria-label={`删除补充问题：${questions[0]?.title ?? ''}`}
        disabled={busy} onClick={onDelete}><Trash2 size={16} /></button>
    </div>
    {open && <AdaptiveSheet open title="需要你的补充" width={520} onClose={() => { if (!busy) setOpen(false); }}>
      <form className="chat-detail-stack" onSubmit={event => { event.preventDefault(); void submit(); }}>
        {questions.map((question, index) => <fieldset key={index} className="chat-question" disabled={disabled || busy}>
          <legend>{question.title}</legend>{question.options?.map((option, position) =>
            <label className="chat-choice" key={position}><input type="radio" name={`${item.id}:${index}`}
              checked={answers[index] === option} onChange={() => update(index, option)} /><span>{option}</span></label>)}
          <textarea className="chat-answer" aria-label={question.title} placeholder="输入你的回答" rows={2}
            value={answers[index] ?? ''} onChange={event => update(index, event.target.value)} />
        </fieldset>)}
        {(error || failure) && <p role="alert" className="chat-error">{error || failure}</p>}
        <button type="submit" className="chat-button chat-primary"
          disabled={busy || disabled || answers.some(value => !value.trim())}>{busy ? '正在提交…' : '提交回答'}</button>
      </form>
    </AdaptiveSheet>}
  </>;
}
export function ChatAsyncQuestions({ thread, scope, ...props }: Props) {
  const { dismissed, dismiss, error } = useDismissedQuestions(scope);
  const questionKey = (item: Item) => JSON.stringify([thread?.id, item.id]);
  const questions = pendingQuestions(thread).filter(item => !dismissed.has(questionKey(item)));
  if (!questions.length) return null;
  return <div className="chat-async-questions chat-scroll">
    {questions.map(item => <QuestionCard key={questionKey(item)} item={item} {...props}
      onDelete={() => dismiss(questionKey(item))} />)}
    {error && <p role="alert" className="chat-error">{error}</p>}
  </div>;
}
