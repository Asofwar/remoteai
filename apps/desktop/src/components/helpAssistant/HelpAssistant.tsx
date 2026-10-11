import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Plus, X } from 'lucide-react';
import type { Language } from '../../i18n';
import type { DashboardPage } from '../dashboard/DashboardNavigation';
import { helpCopy } from './copy';
import { MAX_QUESTION_LENGTH } from './types';
import { useHelpAssistant } from './useHelpAssistant';
import { HelpMessages } from './HelpMessages';
import { HelpSetupNotice } from './HelpSetupNotice';
import { useHelpSetup } from './useHelpSetup';
import assistantIcon from './assistant-icon.jpg';
import styles from './helpAssistant.module.less';

export function HelpAssistant(props: { language: Language; page: DashboardPage; onOpenCodex: () => void }) {
  const [open, setOpen] = useState(false);
  const assistant = useHelpAssistant({ open, page: props.page });
  const setup = useHelpSetup(assistant.refresh);
  const copy = helpCopy(props.language);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLElement>(null);
  const ready = assistant.status === 'ready' && !setup.phase;
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    if (ready) input.current?.focus(); else panel.current?.focus();
  }, [open, ready]);

  return createPortal(<div className={styles.root}>
    {open && <section id="remote-ai-help" ref={panel} tabIndex={-1} className={styles.panel} role="dialog"
      aria-label={copy.title} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className={styles.header}>
        <span className={styles.avatar}><img src={assistantIcon} alt="" /></span>
        <div><strong>{copy.title}</strong><small>{copy.subtitle}</small></div>
        <button type="button" onClick={assistant.clear} disabled={Boolean(assistant.pending)} aria-label={copy.clear}>
          <Plus size={18} /></button>
        <button type="button" onClick={close} aria-label={copy.close}><X size={18} /></button>
      </header>
      <div className={styles.body}>
        {!assistant.messages.length && !assistant.pending && <div className={styles.welcome}>
          <h3>{copy.welcome}</h3><p>{copy.description}</p>
          {ready && <div className={styles.suggestions}>{copy.questions.map((question) =>
            <button type="button" key={question} onClick={() => { assistant.setDraft(question); input.current?.focus(); }}>
              {question}</button>)}</div>}
        </div>}
        <HelpMessages messages={assistant.messages} pending={assistant.pending} copy={copy} />
        {assistant.checking && <p className={styles.status} role="status">{copy.checking}</p>}
        <HelpSetupNotice status={assistant.status} error={assistant.error} checking={assistant.checking}
          copy={copy} setup={setup} refresh={assistant.refresh}
          onSelectAccount={() => { close(); props.onOpenCodex(); }} />
      </div>
      <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void assistant.send(); }}>
        <textarea ref={input} value={assistant.draft} onChange={(event) => assistant.setDraft(event.target.value)}
          rows={2} maxLength={MAX_QUESTION_LENGTH} placeholder={copy.placeholder} aria-label={copy.placeholder}
          disabled={!ready || Boolean(assistant.pending)} onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault(); void assistant.send();
          }} />
        <div className={styles.composerFooter}><small>{copy.privacy}</small>
          <button type="submit" className={styles.send} aria-label={copy.send}
            disabled={!ready || Boolean(assistant.pending) || !assistant.draft.trim()}><ArrowUp size={19} /></button>
        </div>
      </form>
    </section>}
    <button ref={trigger} type="button" className={styles.launcher} aria-label={open ? copy.close : copy.title}
      aria-expanded={open} aria-controls="remote-ai-help" onClick={() => open ? close() : setOpen(true)}>
      <img src={assistantIcon} alt="" />
      {!open && <span className={styles.tooltip}>{copy.title}</span>}
    </button>
  </div>, document.body);
}
