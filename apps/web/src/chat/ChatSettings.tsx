import { useState } from 'react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { ChatUsage } from './ChatUsage';
import { ChatContextSettings } from './ChatContextSettings';
import type { ContextSettingsApi } from '../../../../shared/remote-chat/contextSettings';
import type { ReadUsage } from '../../../../shared/remote-chat/usage';
import type { Model, ThreadTokenUsage } from './types';
import type { ComposerSettings } from '../../../../shared/remote-chat/composer';
import { SETTINGS_FIELDS, settingOptions, settingValue, settingsNotice, visibleSettingsFields,
  type SettingField } from '../../../../shared/remote-chat/settingsMenu';

interface Props {
  threadId: string | null;
  contextSettings: ContextSettingsApi;
  tokenUsage?: ThreadTokenUsage;
  readUsage: ReadUsage;
  models: Model[];
  selection: ComposerSettings;
  saving: boolean;
  ready: boolean;
  error: string;
  updateSettings: (settings: Partial<ComposerSettings>) => Promise<void>;
  onClose: () => void;
}

export function ChatSettings({ models, selection, saving, ready, error, updateSettings, onClose,
  readUsage, tokenUsage, threadId, contextSettings }: Props) {
  const [field, setField] = useState<SettingField | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const notice = settingsNotice({ saving, ready, error });
  const choose = async (value: string) => {
    if (!field) return;
    if (value !== selection[field] || error) await updateSettings({ [field]: value });
    setField((current) => current === field ? null : current);
  };
  return <AdaptiveSheet open title="聊天设置" width={400} onClose={onClose}>
    <div className="chat-settings" aria-hidden={field !== null || contextOpen}>
      {visibleSettingsFields(selection).map((entry) => <button key={entry.field} type="button"
        className="chat-setting-entry"
        aria-label={`设置${entry.label}`} onClick={() => setField(entry.field)} tabIndex={field ? -1 : 0}>
        <strong>{entry.label}</strong><span>{settingValue(entry.field, models, selection)}</span>
        <span aria-hidden="true">›</span>
      </button>)}
      {!!notice && <p role={error ? 'alert' : 'status'} className={error ? 'chat-error' : 'chat-muted'}>{notice}</p>}
      {!!error && <button type="button" className="chat-button" onClick={() => { void updateSettings(selection); }}>
        重新保存</button>}
      <ChatUsage read={readUsage} active={!field && !contextOpen} ready={ready} tokenUsage={tokenUsage}
        onContextSettings={threadId ? () => setContextOpen(true) : undefined} />
    </div>
    {field && <AdaptiveSheet open title={SETTINGS_FIELDS.find((entry) => entry.field === field)!.title} width={400}
      onBack={() => setField(null)} onClose={() => setField(null)}>
      <div className="chat-settings chat-setting-options" role="radiogroup">
        {settingOptions(field, models, selection).map((option) => <button key={option.value}
          type="button" role="radio" aria-label={option.label} aria-checked={selection[field] === option.value}
          className="chat-setting-option" onClick={() => { void choose(option.value); }}>
          <span className="chat-row"><strong className="chat-grow">{option.label}</strong>
            {selection[field] === option.value && <span aria-hidden="true">✓</span>}</span>
          {option.description && <small>{option.description}</small>}
        </button>)}
      </div>
    </AdaptiveSheet>}
    {contextOpen && threadId && <ChatContextSettings threadId={threadId} api={contextSettings}
      onClose={() => setContextOpen(false)} />}
  </AdaptiveSheet>;
}
