import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { MAX_REFRESH_MINUTES, MIN_REFRESH_MINUTES, saveRefreshMinutes } from './refreshInterval';

export function RefreshIntervalSheet({ minutes, onClose, onSaved }: {
  minutes: number; onClose: () => void; onSaved: (value: number) => void;
}) {
  const [input, setInput] = useState(String(minutes));
  const [error, setError] = useState('');
  const save = () => {
    const next = Number(input);
    if (!Number.isInteger(next) || next < MIN_REFRESH_MINUTES || next > MAX_REFRESH_MINUTES) {
      setError('请输入 1 到 1440 之间的整数分钟');
      return;
    }
    saveRefreshMinutes(next);
    onSaved(next);
    onClose();
    Toast.show({ icon: 'success', content: `已设置为每 ${next} 分钟自动刷新用量` });
  };
  return <AdaptiveSheet open title="自动刷新用量" onClose={onClose} width={400}>
    <p className="settings-hint">定时刷新所有账号的用量，也可以随时手动刷新。</p>
    <Form layout="vertical" footer={<Button block color="primary" onClick={save}>保存</Button>}>
      <Form.Item label="刷新间隔（分钟）" help="可设置为 1–1440 分钟，默认为 30 分钟。">
        <Input aria-label="刷新间隔（分钟）" value={input} inputMode="numeric" onEnterPress={save}
          onChange={value => { setInput(value.replace(/\D/g, '').slice(0, 4)); setError(''); }} />
      </Form.Item>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Form>
  </AdaptiveSheet>;
}
