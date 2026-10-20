import { useState, type FormEvent } from 'react';
import { Button, Input, InputNumber, Radio } from 'antd';
import { ArrowRight } from 'lucide-react';
import { guiLocale, guiText as t } from '../../../i18n/guiText';
import { MAX_PORT } from './settings';
import type { MappingProtocol } from '../../../../../../shared/port-mapping/settings';
import { DEFAULT_MAPPING_HOST, mappingAddress } from '../../../../../../shared/port-mapping/target';
import type { ForwardingEntry, PortForwardingService } from './service';
import styles from './portForwarding.module.less';

interface MappingFormProps {
  formId: string;
  service: PortForwardingService;
  entry?: ForwardingEntry;
  connected: boolean;
  done: () => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
}

function useMappingForm({ service, entry, done, saving, setSaving }: MappingFormProps) {
  const [remoteHost, setRemoteHost] = useState(entry?.remoteHost ?? '');
  const [protocol, setProtocol] = useState<MappingProtocol>(entry?.protocol ?? 'tcp');
  const [remotePort, setRemotePort] = useState<number | null>(entry?.remotePort ?? null);
  const [localPort, setLocalPort] = useState<number | null>(entry?.localPort ?? null);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const target = { remoteHost, remotePort: remotePort ?? 0, localPort: localPort ?? remotePort ?? 0, protocol };
      if (entry) await service.edit(entry.id, target);
      else service.add(target.remotePort, target.localPort, target.remoteHost, protocol);
      done();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '映射未能保存，请重试。'); }
    finally { setSaving(false); }
  };
  return { remoteHost, setRemoteHost, protocol, setProtocol, remotePort, setRemotePort,
    localPort, setLocalPort, error, submit };
}

export function MappingForm(props: MappingFormProps) {
  const { entry, saving, formId } = props;
  const form = useMappingForm(props);
  return <form id={formId} className={styles.form} onSubmit={form.submit}>
    <div className={styles.field}>
      <Radio.Group className={styles.protocols} aria-label={t('传输协议')} value={form.protocol}
        disabled={saving} onChange={event => form.setProtocol(event.target.value as MappingProtocol)}>
        <Radio.Button value="tcp">TCP</Radio.Button><Radio.Button value="udp">UDP</Radio.Button>
        <Radio.Button value="both">TCP + UDP</Radio.Button>
      </Radio.Group>
    </div>
    <div className={styles.field}>
      <label className={styles.label} htmlFor="mapping-host">{t('目标 IP')}<span>{t('选填')}</span></label>
      <Input id="mapping-host" aria-label={t('目标 IP')}
        value={form.remoteHost} onChange={event => form.setRemoteHost(event.target.value)}
        placeholder={DEFAULT_MAPPING_HOST} disabled={saving} autoComplete="off" spellCheck={false} autoFocus />
    </div>
    <div className={styles.fields}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="mapping-remote-port">{t('远程端口')}</label>
        <InputNumber id="mapping-remote-port" aria-label={t('远程端口')} min={1} max={MAX_PORT}
          value={form.remotePort} onChange={form.setRemotePort} placeholder="3000" disabled={saving} />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="mapping-local-port">{t('本地端口')}<span>{t('选填')}</span></label>
        <InputNumber id="mapping-local-port" aria-label={t('本地端口')}
          min={1} max={MAX_PORT} value={form.localPort} onChange={form.setLocalPort}
          placeholder={t('同远程端口')} disabled={saving} />
      </div>
    </div>
    {entry && <MappingPreview remoteHost={form.remoteHost} remotePort={form.remotePort}
      localPort={form.localPort} updatedAt={entry.updatedAt} />}
    {form.error && <div className={styles.error} role="alert">{t(form.error)}</div>}
  </form>;
}

export function MappingFormActions({ formId, entry, connected, done, saving }:
  Pick<MappingFormProps, 'formId' | 'entry' | 'connected' | 'done' | 'saving'>) {
  return <div className={styles.formActions}>
    <Button onClick={done} disabled={saving} aria-label={t('取消')}>{t('取消')}</Button>
    <Button form={formId} htmlType="submit" type="primary" className={styles.primary} loading={saving}>
      {t(entry ? '保存修改' : connected ? '添加并启动' : '添加映射')}</Button>
  </div>;
}

function MappingPreview({ remoteHost, remotePort, localPort, updatedAt }: {
  remoteHost: string; remotePort: number | null; localPort: number | null; updatedAt?: number;
}) {
  let target = '—';
  try {
    if (remotePort) target = mappingAddress({ remoteHost, remotePort });
  } catch { /* Keep the draft editable; submission reports invalid IP addresses. */ }
  return <div className={styles.previewSection}>
    <div className={styles.preview}>
      <span>{t('本机访问')} → {t('远程目标')}</span>
      <div><code>127.0.0.1:{localPort ?? remotePort ?? '—'}</code><ArrowRight size={18} aria-hidden="true" />
        <code>{target}</code></div>
    </div>
    {updatedAt && <p className={styles.hint}>
      {t('最近编辑')} · {new Date(updatedAt).toLocaleString(guiLocale())}
    </p>}
  </div>;
}
