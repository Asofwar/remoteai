import { useState } from 'react';
import { Target, X } from 'lucide-react';
import { GOAL_STATUS, type ThreadGoal } from '../../../desktop/src/pages/codexGui/goalTypes';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { t, useLanguage } from '../i18n';
import './composerGoal.css';

interface Props {
  goal?: ThreadGoal | null;
  draft: string;
  disabled: boolean;
  remove: () => void;
  beforeOpen: () => void;
}

export function ComposerGoal({ goal, draft, disabled, remove, beforeOpen }: Props) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const objective = goal?.objective ?? draft.trim();
  return <>
    <div className="chat-composer-goal">
      <button type="button" className="chat-goal-preview" aria-label={t('查看目标')}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => { beforeOpen(); setOpen(true); }}>
        <Target size={16} />
        <span className="chat-goal-content">
          <span className="chat-goal-label">{t(goal ? '目标' : '目标模式')}</span>
          {goal && <span className="chat-goal-objective">{goal.objective}</span>}
        </span>
      </button>
      <button type="button" className="chat-goal-remove" aria-label={t('移除目标')} disabled={disabled}
        onClick={remove}><X size={16} /></button>
    </div>
    <AdaptiveSheet open={open} title={t(goal ? '目标详情' : '目标模式')} width={400}
      className="chat-goal-sheet" onClose={() => setOpen(false)}>
      <div className="chat-goal-details">
        {goal && <p className="chat-goal-label">{t(GOAL_STATUS[goal.status])}</p>}
        <p className="chat-goal-objective">{objective || t('描述想完成的目标…')}</p>
        {!goal && <p className="chat-goal-help">
          {t('描述想完成的结果。Codex 会持续推进，直到完成目标或需要你的协助。')}
        </p>}
      </div>
    </AdaptiveSheet>
  </>;
}
