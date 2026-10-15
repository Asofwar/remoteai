import { useState } from 'react';
import { Button, Input, InputNumber } from 'antd';
import { Plus } from 'lucide-react';
import type { ForwardingEntry, PortForwardingService } from '../../../../../shared/port-mapping/service';
import { MAX_PORT } from '../../../../../shared/port-mapping/settings';
import { t } from '../../i18n';

export function MappingForm({ service, disabled, connected = true, entry, done }: {
  service: PortForwardingService; disabled?: boolean; connected?: boolean; entry?: ForwardingEntry; done?: () => void;
}) {
  const [remoteHost, setRemoteHost] = useState(entry?.remoteHost ?? '');
  const [port, setPort] = useState<number | null>(entry?.remotePort ?? null);
  const [localPort, setLocalPort] = useState<number | null>(entry?.localPort ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const reset = () => { setRemoteHost(''); setPort(null); setLocalPort(null); setError(''); done?.(); };
  return <form className="port-mapping-form" onSubmit={async event => {
    event.preventDefault();
    if (disabled || saving) return;
    setSaving(true);
    try {
      const target = { remoteHost, remotePort: port ?? 0, localPort: localPort ?? port ?? 0 };
      if (entry) await service.edit(entry.id, target);
      else service.add(target.remotePort, target.localPort, target.remoteHost);
      reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '映射未能保存，请重试。'); }
    finally { setSaving(false); }
  }}>
    <strong>{t(entry ? '编辑映射' : '添加映射')}</strong>
    <div className="mapping-fields">
      <label>{t('目标 IP')}<Input aria-label={t('目标 IP')} value={remoteHost}
        onChange={event => setRemoteHost(event.target.value)} placeholder="192.168.1.100" disabled={disabled || saving}
        autoComplete="off" spellCheck={false} /></label>
      <label>{t('远程端口')}<InputNumber aria-label={t('远程端口')} min={1} max={MAX_PORT}
        value={port} onChange={setPort} placeholder="8080" disabled={disabled || saving} /></label>
      <label>{t('本地端口')}<InputNumber aria-label={t('本地端口')} min={1} max={MAX_PORT}
        value={localPort} onChange={setLocalPort} placeholder={port ? String(port) : t('默认同远程端口')}
        disabled={disabled || saving} /></label>
    </div>
    <p className="mapping-hint">{t('本地端口供手机和电脑使用，网页仅预览目标地址。')}</p>
    {error && <p role="alert">{t(error)}</p>}
    <div className="mapping-form-actions"><Button onClick={reset} disabled={saving} aria-label={t('取消')}>
      {t('取消')}</Button>
      <Button type="primary" htmlType="submit" disabled={disabled} loading={saving}
        icon={!entry && <Plus size={17} />}>
        {t(entry ? '保存修改' : connected ? '添加并启动' : '添加映射')}</Button></div>
  </form>;
}
