import { useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { pendingQuestions } from '../../../../shared/remote-chat/client/asyncQuestions';
import type { Item, Thread } from './types';

interface Props {
  thread: Thread | null; disabled: boolean; error: string;
  answer: (item: Item, answers: string[]) => Promise<boolean>;
}
function QuestionCard({ item, disabled, error, answer }: Omit<Props, 'thread'> & { item: Item }) {
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
    <button type="button" className="chat-question-entry" onClick={() => setOpen(true)}
      aria-label={`回答补充问题：${questions[0]?.title ?? ''}`}><MessageCircle size={19} />
      <span className="chat-grow"><strong>需要你的补充</strong><small className="chat-ellipsis">
        {questions[0]?.title}</small></span><span>回答 ›</span></button>
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
export function ChatAsyncQuestions({ thread, ...props }: Props) {
  const questions = pendingQuestions(thread);
  if (!questions.length) return null;
  return <div className="chat-async-questions chat-scroll">{questions.map(item =>
    <QuestionCard key={`${thread?.id}:${item.id}`} item={item} {...props} />)}</div>;
}
