import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { MAX_REFRESH_MINUTES, MIN_REFRESH_MINUTES, saveRefreshMinutes } from './refreshInterval';

export function RefreshIntervalSheet({ minutes, onClose, onSaved }: {
  minutes: number; onClose: () => void; onSaved: (value: number) => void;
}) {
  useLanguage();
  const [input, setInput] = useState(String(minutes));
  const [error, setError] = useState('');
  const save = () => {
    const next = Number(input);
    if (!Number.isInteger(next) || next < MIN_REFRESH_MINUTES || next > MAX_REFRESH_MINUTES) {
      setError(t("请输入 1 到 1440 之间的整数分钟"));
      return;
    }
    saveRefreshMinutes(next);
    onSaved(next);
    onClose();
    Toast.show({ icon: 'success', content: t("已设置为每 {value1} 分钟自动刷新用量", { value1: next }) });
  };
  return <AdaptiveSheet open title={t("自动刷新用量")} onClose={onClose} width={400}>
    <p className="settings-hint">{t("定时刷新所有账号的用量，也可以随时手动刷新。")}</p>
    <Form layout="vertical" footer={<Button block color="primary" onClick={save}>{t("保存")}</Button>}>
      <Form.Item label={t("刷新间隔（分钟）")} help={t("可设置为 1–1440 分钟，默认为 30 分钟。")}>
        <Input aria-label={t("刷新间隔（分钟）")} value={input} inputMode="numeric" onEnterPress={save}
          onChange={value => { setInput(value.replace(/\D/g, '').slice(0, 4)); setError(''); }} />
      </Form.Item>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
    </Form>
  </AdaptiveSheet>;
}
