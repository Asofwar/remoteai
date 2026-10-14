import { useEffect, useState } from 'react';
import { Alert, Button, InputNumber, Popover, Tooltip, message } from 'antd';
import { ArrowRight, Cable, Copy, Play, Plus, Square, Trash2 } from 'lucide-react';
import { guiText as t } from '../../../i18n/guiText';
import { copyText } from '../../../utils/clipboard';
import { usePortForwarding } from './usePortForwarding';
import { MAX_PORT, MAX_PORT_MAPPINGS } from './settings';
import type { ForwardingClient, ForwardingEntry, PortForwardingService } from './service';
import launcherStyles from '../GuiRemoteDesktop.module.less';
import styles from './portForwarding.module.less';

const STATUS_TEXT = { stopped: '已停止', starting: '正在启动…', running: '转发中',
  stopping: '正在停止…', error: '启动失败' } as const;

export function PortForwarding(props: {
  client: ForwardingClient; scope: string; connected: boolean; active: boolean;
}) {
  const { entries, service } = usePortForwarding(props);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!props.active) setOpen(false); }, [props.active]);
  const count = entries.filter(entry => entry.status === 'running').length;
  return <Popover trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} fresh
    styles={{ root: { maxWidth: 400 } }} content={<section className={styles.panel}
      aria-hidden={!open || !props.active} aria-label={t('端口转发设置')}>
      <header><strong>{t('端口转发')}</strong><span>{entries.length}/{MAX_PORT_MAPPINGS}</span></header>
      <p>{t('将远程电脑的端口映射到本机，方便在本机访问。')}</p>
      {!props.connected && <Alert type="info" message={t('连接已断开，重新连接后可再次启动。')} />}
      <div className={styles.list}>
        {entries.map(entry => <MappingRow key={entry.id} entry={entry} service={service}
          connected={props.connected} />)}
      </div>
      {!entries.length && <div className={styles.empty}>{t('还没有端口映射')}</div>}
      <MappingForm service={service} disabled={!props.connected || entries.length >= MAX_PORT_MAPPINGS} />
      <footer>{t('支持 TCP，仅本机可访问。')}</footer>
    </section>}>
    <button type="button" className={launcherStyles.launcher} aria-label={t('端口转发')} aria-expanded={open}>
      <Cable size={14} aria-hidden="true" /><span>{t('端口转发')}</span>
      {count > 0 && <span className={styles.count}>{count}</span>}
    </button>
  </Popover>;
}

function MappingForm({ service, disabled }: { service: PortForwardingService; disabled: boolean }) {
  const [remotePort, setRemotePort] = useState<number | null>(null);
  const [localPort, setLocalPort] = useState<number | null>(null);
  const [error, setError] = useState('');
  return <form className={styles.form} onSubmit={event => {
    event.preventDefault();
    if (disabled) return;
    try {
      service.add(remotePort ?? 0, localPort ?? remotePort ?? 0);
      setError(''); setRemotePort(null); setLocalPort(null);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '端口映射未能添加，请重试。'); }
  }}>
    <div className={styles.fields}>
      <label>{t('远程端口')}<InputNumber aria-label={t('远程端口')} min={1} max={MAX_PORT}
        value={remotePort} onChange={setRemotePort} placeholder="3000" disabled={disabled} /></label>
      <ArrowRight size={16} aria-hidden="true" />
      <label>{t('本地端口')}<InputNumber aria-label={t('本地端口')} min={1} max={MAX_PORT}
        value={localPort} onChange={setLocalPort} placeholder={remotePort ? String(remotePort) : t('默认同远程端口')}
        disabled={disabled} /></label>
    </div>
    {error && <div className={styles.error} role="alert">{t(error)}</div>}
    <Button htmlType="submit" type="primary" block icon={<Plus size={14} />} disabled={disabled}>
      {t('添加并启动')}</Button>
  </form>;
}

function MappingRow({ entry, service, connected }: {
  entry: ForwardingEntry; service: PortForwardingService; connected: boolean;
}) {
  const busy = entry.status === 'starting' || entry.status === 'stopping';
  const running = entry.status === 'running';
  const label = `${entry.remotePort} → ${entry.localPort}`;
  const copy = async () => {
    try {
      await copyText(`127.0.0.1:${entry.localPort}`);
      void message.success({ content: t('本地地址已复制'), style: { maxWidth: 400, marginInline: 'auto' } });
    } catch { void message.error({ content: t('复制失败，请重试。'), style: { maxWidth: 400, marginInline: 'auto' } }); }
  };
  return <article className={styles.mapping} aria-label={label}>
    <div className={styles.row}>
      <strong>{label}</strong>
      <span className={styles.status} data-running={running} role="status">{t(STATUS_TEXT[entry.status])}</span>
      <Tooltip title={t('删除映射')} styles={{ root: { maxWidth: 400 } }}>
        <Button type="text" size="small" aria-label={`${t('删除映射')} ${label}`} icon={<Trash2 size={14} />}
          disabled={entry.status === 'stopping'} onClick={() => { void service.remove(entry.id); }} />
      </Tooltip>
    </div>
    <div className={styles.row}>
      <code>127.0.0.1:{entry.localPort}</code>
      <Tooltip title={t('复制本地地址')} styles={{ root: { maxWidth: 400 } }}>
        <Button type="text" size="small" disabled={!running} aria-label={`${t('复制本地地址')} ${label}`}
          icon={<Copy size={14} />} onClick={() => { void copy(); }} />
      </Tooltip>
      <Button size="small" loading={entry.status === 'stopping'}
        disabled={entry.status === 'stopping' || (!connected && !running && !busy)}
        aria-label={`${t(running || busy ? '停止转发' : '启动转发')} ${label}`}
        icon={running || busy ? <Square size={12} /> : <Play size={12} />}
        onClick={() => { void (running || busy ? service.stop(entry.id) : service.start(entry.id)); }}>
        {t(running || busy ? '停止' : '启动')}</Button>
    </div>
    {entry.error && <div className={styles.error} role="alert">{t(entry.error)}</div>}
  </article>;
}
