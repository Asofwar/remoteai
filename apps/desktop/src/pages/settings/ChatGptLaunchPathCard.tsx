import { Button, Input } from 'antd';
import { AppWindow } from 'lucide-react';
import type { Language } from '../../i18n';
import { useChatGptLaunchPath } from '../../hooks/useChatGptLaunchPath';
import { chatGptLaunchPathCopy } from './chatgptLaunchPathCopy';
import styles from './ChatGptLaunchPathCard.module.less';

export function ChatGptLaunchPathCard({ language }: { language: Language }) {
  const setting = useChatGptLaunchPath();
  const copy = chatGptLaunchPathCopy(language);
  const errorText = setting.error === 'save' ? copy.error : setting.error && copy[setting.error];
  return <section className={`settings-card ${styles.card}`} aria-busy={setting.loading}>
    <div className="settings-icon"><AppWindow size={23} /></div>
    <div className="settings-card-content">
      <div className="settings-card-copy">
        <h3>{copy.title}</h3>
        <p id="chatgpt-launch-path-description">{copy.description}</p>
      </div>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void setting.save(); }}>
        <label htmlFor="chatgpt-launch-path">{copy.label}</label>
        <div className={styles.controls}>
          <Input id="chatgpt-launch-path" value={setting.path} allowClear
            placeholder={setting.detectedPath ?? (setting.loading ? copy.loading : copy.placeholder)}
            disabled={setting.loading || !setting.loaded} status={setting.error ? 'error' : undefined}
            aria-describedby="chatgpt-launch-path-description chatgpt-launch-path-status"
            autoComplete="off" spellCheck={false} onChange={(event) => setting.edit(event.target.value)} />
          <Button htmlType="submit" loading={setting.loading && setting.loaded}
            disabled={setting.loading || !setting.loaded || !setting.dirty}>{copy.save}</Button>
        </div>
        <div id="chatgpt-launch-path-status" className={styles.status} aria-live="polite">
          {errorText && <span role="alert" className={styles.error}>{errorText}</span>}
          {setting.saved && <span>{copy.saved}</span>}
        </div>
      </form>
    </div>
  </section>;
}
