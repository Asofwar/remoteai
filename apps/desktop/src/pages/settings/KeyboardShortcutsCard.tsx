import { useState } from 'react';
import { Button } from 'antd';
import { Keyboard } from 'lucide-react';
import { isDesktopApp } from '../../api/backend';
import { DEFAULT_SCREENSHOT_SHORTCUT, shortcutLabel, type ShortcutSetting } from '../../api/keyboardShortcuts';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import type { Translate } from '../../i18n';
import { KeyboardShortcutEditor } from './KeyboardShortcutEditor';
import styles from './KeyboardShortcuts.module.less';

function DesktopShortcuts({ t }: { t: Translate }) {
  const { settings, loading, saving, error, load, save, clearError } = useKeyboardShortcuts();
  const [editing, setEditing] = useState<ShortcutSetting | null>(null);
  return <section className={`settings-card ${styles.card}`}>
    <div className="settings-icon"><Keyboard size={23} /></div>
    <div className={styles.content}>
      {loading && <p role="status">{t('settings.loading')}</p>}
      {error && !editing && <p role="alert" className={styles.error}>{t(`settings.shortcuts.error.${error}`)}</p>}
      {!loading && !settings.length && <Button onClick={() => void load()}>{t('settings.shortcuts.retry')}</Button>}
      {settings.map(setting => <div key={setting.action} className={styles.row}>
        <div className={styles.copy}>
          <h3>{t(`settings.shortcuts.${setting.action}`)}</h3>
          <p>{setting.supported ? shortcutLabel(setting.shortcut) || t('settings.shortcuts.unassigned')
            : t('settings.shortcuts.error.unsupported')}</p>
          {setting.error && <p role="alert" className={styles.error}>
            {t(`settings.shortcuts.error.${setting.error}`)}</p>}
        </div>
        <div className={styles.actions}>
          <Button size="small" disabled={saving || !setting.supported} onClick={() => {
            clearError(); setEditing(setting);
          }}>{t('settings.shortcuts.edit')}</Button>
          {setting.shortcut && <Button size="small" disabled={saving || !setting.supported}
            onClick={() => void save(setting.action, null)}>{t('settings.shortcuts.clear')}</Button>}
          {setting.action === 'screenshot' && (setting.shortcut !== DEFAULT_SCREENSHOT_SHORTCUT || !setting.active)
            && <Button size="small" disabled={saving || !setting.supported}
              onClick={() => void save(setting.action, DEFAULT_SCREENSHOT_SHORTCUT)}>
              {t('settings.shortcuts.reset')}</Button>}
        </div>
      </div>)}
    </div>
    {editing && <KeyboardShortcutEditor setting={editing} saving={saving} error={error} t={t}
      onClose={() => { setEditing(null); clearError(); }}
      onSave={shortcut => save(editing.action, shortcut)} />}
  </section>;
}

export function KeyboardShortcutsCard({ t }: { t: Translate }) {
  return isDesktopApp ? <DesktopShortcuts t={t} />
    : <p>{t('settings.shortcuts.desktopOnly')}</p>;
}
