import { useState } from 'react';
import { Button, Checkbox, Modal } from 'antd';
import { shortcutLabel, type ShortcutError, type ShortcutSetting } from '../../api/keyboardShortcuts';
import type { Translate } from '../../i18n';
import styles from './KeyboardShortcuts.module.less';

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'] as const;
const KEYS = [
  ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
  ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
  ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`),
];

interface Props {
  setting: ShortcutSetting;
  saving: boolean;
  error: ShortcutError | null;
  onSave: (shortcut: string) => Promise<boolean>;
  onClose: () => void;
  t: Translate;
}

export function KeyboardShortcutEditor({ setting, saving, error, onSave, onClose, t }: Props) {
  const parts = setting.shortcut?.split('+') ?? [];
  const [modifiers, setModifiers] = useState<string[]>(parts.slice(0, -1));
  const [key, setKey] = useState(parts.at(-1) ?? '');
  const shortcut = [...MODIFIERS.filter(modifier => modifiers.includes(modifier)), key].join('+');
  const valid = !!key && modifiers.some(modifier => modifier !== 'Shift');
  const save = async () => { if (await onSave(shortcut)) onClose(); };
  return <Modal open width={400} title={t(`settings.shortcuts.${setting.action}`)}
    onCancel={saving ? undefined : onClose} closable={!saving} maskClosable={!saving}
    footer={<>
      <Button disabled={saving} onClick={onClose}>{t('settings.shortcuts.cancel')}</Button>
      <Button type="primary" disabled={!valid || saving} loading={saving} onClick={() => void save()}>
        {t('settings.shortcuts.save')}</Button>
    </>}>
    <div className={styles.editor}>
      <p>{t('settings.shortcuts.hint')}</p>
      <fieldset disabled={saving}>
        <legend>{t('settings.shortcuts.modifiers')}</legend>
        <div className={styles.modifiers}>{MODIFIERS.map(modifier => <Checkbox key={modifier}
          checked={modifiers.includes(modifier)} disabled={saving} onChange={event => setModifiers(current =>
            event.target.checked ? [...current, modifier] : current.filter(value => value !== modifier))}>
          {shortcutLabel(modifier)}</Checkbox>)}</div>
      </fieldset>
      <label htmlFor="keyboard-shortcut-key">{t('settings.shortcuts.key')}</label>
      <select id="keyboard-shortcut-key" value={key} disabled={saving} onChange={event => setKey(event.target.value)}>
        <option value="">{t('settings.shortcuts.chooseKey')}</option>
        {KEYS.map(value => <option key={value} value={value}>{shortcutLabel(value)}</option>)}
      </select>
      {valid && <output className={styles.preview}>{shortcutLabel(shortcut)}</output>}
      {error && <p role="alert" className={styles.error}>{t(`settings.shortcuts.error.${error}`)}</p>}
    </div>
  </Modal>;
}
