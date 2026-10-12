import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { message } from 'antd';
import { Plus, X } from 'lucide-react';
import type { Language } from '../../i18n';
import { useHelpAssistantVisibility } from '../../hooks/useHelpAssistantVisibility';
import type { DashboardPage } from '../dashboard/DashboardNavigation';
import { helpCopy } from './copy';
import { HelpComposer } from './HelpComposer';
import { HelpLauncher } from './HelpLauncher';
import { useHelpAssistant } from './useHelpAssistant';
import { HelpMessages } from './HelpMessages';
import { HelpSetupNotice } from './HelpSetupNotice';
import { useHelpSetup } from './useHelpSetup';
import assistantIcon from './assistant-icon.jpg';
import styles from './helpAssistant.module.less';

export function HelpAssistant(props: { language: Language; page: DashboardPage; onOpenCodex: () => void }) {
  const { visible, setVisible } = useHelpAssistantVisibility();
  const [expanded, setExpanded] = useState(false);
  const open = visible && expanded;
  const assistant = useHelpAssistant({ open, page: props.page });
  const setup = useHelpSetup(assistant.refresh);
  const copy = helpCopy(props.language);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLElement>(null);
  const ready = assistant.status === 'ready' && !setup.phase;
  const close = () => { setExpanded(false); trigger.current?.focus(); };

  useEffect(() => { if (!visible) setExpanded(false); }, [visible]);

  useEffect(() => {
    if (!open) return;
    if (ready) input.current?.focus(); else panel.current?.focus();
  }, [open, ready]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (panel.current?.contains(event.target) || trigger.current?.contains(event.target)) return;
      setExpanded(false);
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, [open]);

  if (!visible) return null;

  return createPortal(<div className={styles.root}>
    {open && <section id="remote-ai-help" ref={panel} tabIndex={-1} className={styles.panel} role="dialog"
      aria-label={copy.title} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className={styles.header}>
        <span className={styles.avatar}><img src={assistantIcon} alt="" /></span>
        <div><strong>{copy.title}</strong><small>{copy.subtitle}</small></div>
        <button type="button" onClick={assistant.clear}
          disabled={Boolean(assistant.pending) || assistant.attachments.reading} aria-label={copy.clear}>
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
        <HelpMessages messages={assistant.messages} pending={assistant.pending} streamed={assistant.streamed} copy={copy} />
        {assistant.checking && <p className={styles.status} role="status">{copy.checking}</p>}
        <HelpSetupNotice status={assistant.status} error={assistant.error} checking={assistant.checking}
          copy={copy} setup={setup} refresh={assistant.refresh}
          onSelectAccount={() => { close(); props.onOpenCodex(); }} />
      </div>
      <HelpComposer copy={copy} input={input} draft={assistant.draft} setDraft={assistant.setDraft}
        disabled={!ready || Boolean(assistant.pending)} attachments={assistant.attachments} send={assistant.send} />
    </section>}
    <HelpLauncher copy={copy} open={open} unread={assistant.unread} trigger={trigger}
      onToggle={() => open ? close() : setExpanded(true)}
      onHide={() => {
        if (!setVisible(false)) void message.error({ content: copy.visibilitySaveError,
          style: { maxWidth: 400, marginInline: 'auto' } });
      }} />
  </div>, document.body);
}
