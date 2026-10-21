import { AUTO_SAVE_OPTIONS, type BrowserPreferences } from './preferences';
import type { BrowserTranslate } from './ProjectTree';
import './autoSaveSettings.css';

export function AutoSaveSettings({ preferences, t }: { preferences: BrowserPreferences; t: BrowserTranslate }) {
  return <div className="pf-auto-save-settings">
    <label><span>{t('文件自动保存')}</span>
      <select aria-label={t('文件自动保存')} value={preferences.delay}
        onChange={event => preferences.change(Number(event.target.value))}>
        {AUTO_SAVE_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
      </select>
    </label>
    <p>{t('停止输入后自动保存。关闭后，可点击保存或按 Ctrl+S（Mac：⌘S）。')}</p>
  </div>;
}
