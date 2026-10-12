import { useState, type RefObject } from 'react';
import { Dropdown } from 'antd';
import { EyeOff } from 'lucide-react';
import type { HelpCopy } from './copy';
import assistantIcon from './assistant-icon.jpg';
import styles from './helpAssistant.module.less';

interface Props {
  copy: HelpCopy;
  open: boolean;
  trigger: RefObject<HTMLButtonElement>;
  onToggle: () => void;
  onHide: () => void;
}

export function HelpLauncher({ copy, open, trigger, onToggle, onHide }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <Dropdown trigger={['contextMenu']} open={menuOpen} onOpenChange={setMenuOpen}
    autoFocus overlayClassName={styles.launcherMenu}
    menu={{ items: [{ key: 'hide', label: copy.hide, icon: <EyeOff size={15} /> }],
      onClick: () => { setMenuOpen(false); onHide(); } }}>
    <button ref={trigger} type="button" className={styles.launcher} aria-label={open ? copy.close : copy.title}
      aria-expanded={open} aria-controls="remote-ai-help"
      onClick={() => { setMenuOpen(false); onToggle(); }}
      onKeyDown={(event) => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault(); setMenuOpen(true);
      }}>
      <img src={assistantIcon} alt="" />
      {!open && !menuOpen && <span className={styles.tooltip}>{copy.title}</span>}
    </button>
  </Dropdown>;
}
