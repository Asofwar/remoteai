import { useEffect, useState } from 'react';
import { Alert, Button, Input, InputNumber, Popover, Tooltip, message } from 'antd';
import { ArrowRight, Cable, Copy, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { guiText as t } from '../../../i18n/guiText';
import { copyText } from '../../../utils/clipboard';
import { usePortForwarding } from './usePortForwarding';
import { ForwardedAddress } from './ForwardedAddress';
import { MAX_PORT, MAX_PORT_MAPPINGS } from './settings';
import { DEFAULT_MAPPING_HOST, mappingAddress } from '../../../../../../shared/port-mapping/target';
import type { ForwardingClient, ForwardingEntry, PortForwardingService } from './service';
import launcherStyles from '../GuiRemoteDesktop.module.less';
import styles from './portForwarding.module.less';

const STATUS_TEXT = { stopped: '已停止', starting: '正在启动…', running: '映射中',
  stopping: '正在停止…', error: '启动失败' } as const;

export function PortForwarding(props: {
  client: ForwardingClient; scope: string; connected: boolean; active: boolean;
}) {
  const { entries, service, syncStatus } = usePortForwarding(props);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ForwardingEntry>();
  useEffect(() => { setEditing(undefined); }, [service]);
  useEffect(() => { if (!props.active) setOpen(false); }, [props.active]);
  const count = entries.filter(entry => entry.status === 'running').length;
  return <Popover trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} fresh
    styles={{ root: { maxWidth: 400 } }} content={<section className={styles.panel}
      aria-hidden={!open || !props.active} aria-label={t('端口映射设置')}>
      <header><strong>{t('端口映射')}</strong><span>{entries.length}/{MAX_PORT_MAPPINGS}</span></header>
      <p>{t('通过远程电脑访问目标 IP 和端口。留空 IP 可访问远程电脑本机。')}</p>
      {!props.connected && <Alert type="info" message={t('连接已断开，重新连接后可再次启动。')} />}
      <div className={styles.list}>
        {entries.map(entry => editing?.id === entry.id
          ? <MappingForm key={entry.id} service={service} entry={editing} done={() => setEditing(undefined)} />
          : <MappingRow key={entry.id} entry={entry} service={service} edit={() => setEditing(entry)}
            connected={props.connected} onOpen={() => setOpen(false)} />)}
      </div>
      {!entries.length && <div className={styles.empty}>{t('还没有端口映射')}</div>}
      {editing && !entries.some(entry => entry.id === editing.id) && <Button onClick={() => setEditing(undefined)}>
        {t('该映射已被删除，请重新添加。')}</Button>}
      {!editing && <MappingForm service={service} disabled={entries.length >= MAX_PORT_MAPPINGS}
        connected={props.connected} />}
      <footer>{t('支持 TCP，仅本机可访问。')}</footer>
      {syncStatus && <footer>{t(syncStatus)}</footer>}
    </section>}>
    <button type="button" className={launcherStyles.launcher} aria-label={t('端口映射')} aria-expanded={open}>
      <Cable size={14} aria-hidden="true" /><span>{t('端口映射')}</span>
      {count > 0 && <span className={styles.count}>{count}</span>}
    </button>
  </Popover>;
}

function MappingForm({ service, disabled, entry, done, connected = true }: {
  service: PortForwardingService; disabled?: boolean; entry?: ForwardingEntry; done?: () => void; connected?: boolean;
}) {
  const [remoteHost, setRemoteHost] = useState(entry?.remoteHost ?? '');
  const [remotePort, setRemotePort] = useState<number | null>(entry?.remotePort ?? null);
  const [localPort, setLocalPort] = useState<number | null>(entry?.localPort ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return <form className={styles.form} onSubmit={async event => {
    event.preventDefault();
    if (disabled || saving) return;
    setSaving(true);
    try {
      const target = { remoteHost, remotePort: remotePort ?? 0, localPort: localPort ?? remotePort ?? 0 };
      if (entry) await service.edit(entry.id, target);
      else service.add(target.remotePort, target.localPort, target.remoteHost);
      setError(''); setRemoteHost(''); setRemotePort(null); setLocalPort(null);
      done?.();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '映射未能保存，请重试。'); }
    finally { setSaving(false); }
  }}>
    {entry && <strong>{t('编辑映射')}</strong>}
    <div className={styles.fields}>
      <label>{t('目标 IP')}<Input aria-label={t('目标 IP')} value={remoteHost}
        onChange={event => setRemoteHost(event.target.value)} placeholder={DEFAULT_MAPPING_HOST} disabled={disabled || saving}
        autoComplete="off" spellCheck={false} /></label>
    </div>
    <div className={styles.fields}>
      <label>{t('远程端口')}<InputNumber aria-label={t('远程端口')} min={1} max={MAX_PORT}
        value={remotePort} onChange={setRemotePort} placeholder="3000" disabled={disabled || saving} /></label>
      <ArrowRight size={16} aria-hidden="true" />
      <label>{t('本地端口')}<InputNumber aria-label={t('本地端口')} min={1} max={MAX_PORT}
        value={localPort} onChange={setLocalPort} placeholder={remotePort ? String(remotePort) : t('默认同远程端口')}
        disabled={disabled || saving} /></label>
    </div>
    {error && <div className={styles.error} role="alert">{t(error)}</div>}
    <div className={styles.row}>
      {entry && <Button onClick={done} disabled={saving} aria-label={t('取消')}>{t('取消')}</Button>}
      <Button htmlType="submit" type="primary" block icon={entry ? <Pencil size={14} /> : <Plus size={14} />}
        disabled={disabled} loading={saving}>
        {t(entry ? '保存修改' : connected ? '添加并启动' : '添加映射')}</Button>
    </div>
  </form>;
}

function MappingRow({ entry, service, connected, onOpen, edit }: {
  entry: ForwardingEntry; service: PortForwardingService; connected: boolean; onOpen: () => void; edit: () => void;
}) {
  const busy = entry.status === 'starting' || entry.status === 'stopping';
  const running = entry.status === 'running';
  const label = `${mappingAddress(entry)} → ${entry.localPort}`;
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
      <Tooltip title={t('编辑映射')} styles={{ root: { maxWidth: 400 } }}>
        <Button type="text" size="small" aria-label={`${t('编辑映射')} ${label}`} icon={<Pencil size={14} />}
          disabled={busy} onClick={edit} />
      </Tooltip>
      <Tooltip title={t('删除映射')} styles={{ root: { maxWidth: 400 } }}>
        <Button type="text" size="small" aria-label={`${t('删除映射')} ${label}`} icon={<Trash2 size={14} />}
          disabled={entry.status === 'stopping'} onClick={() => { void service.remove(entry.id); }} />
      </Tooltip>
    </div>
    <div className={styles.row}>
      <ForwardedAddress port={entry.localPort} running={running} onOpen={onOpen} />
      <Tooltip title={t('复制本地地址')} styles={{ root: { maxWidth: 400 } }}>
        <Button type="text" size="small" disabled={!running} aria-label={`${t('复制本地地址')} ${label}`}
          icon={<Copy size={14} />} onClick={() => { void copy(); }} />
      </Tooltip>
      <Button size="small" loading={entry.status === 'stopping'}
        disabled={entry.status === 'stopping' || (!connected && !running && !busy)}
        aria-label={`${t(running || busy ? '停止映射' : '启动映射')} ${label}`}
        icon={running || busy ? <Square size={12} /> : <Play size={12} />}
        onClick={() => { void (running || busy ? service.stop(entry.id) : service.start(entry.id)); }}>
        {t(running || busy ? '停止' : '启动')}</Button>
    </div>
    {entry.error && <div className={styles.error} role="alert">{t(entry.error)}</div>}
    {entry.updatedAt && <div className={styles.status}>{t('编辑时间')} · {new Date(entry.updatedAt).toLocaleString()}</div>}
  </article>;
}
