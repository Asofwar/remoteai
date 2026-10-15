import { useEffect, useState } from 'react';
import { Alert, Button, Input, InputNumber } from 'antd';
import type { ForwardingClient, ForwardingEntry, PortForwardingService }
  from '../../../../../shared/port-mapping/service';
import { MAX_PORT, MAX_PORT_MAPPINGS } from '../../../../../shared/port-mapping/settings';
import { DEFAULT_MAPPING_HOST, mappingAddress, mappingOrigin } from '../../../../../shared/port-mapping/target';
import { AdaptiveSheet } from '../../components/AdaptiveSheet';
import { t } from '../../i18n';
import { usePortMappings } from './usePortMappings';
import { MappingPreview } from './MappingPreview';
import './portMapping.css';

const STATUS = { stopped: '已停止', starting: '正在启动…', running: '映射中',
  stopping: '正在停止…', error: '启动失败' } as const;

export function PortMappings(props: {
  client: ForwardingClient; scope: string; connected: boolean; active: boolean;
  open: boolean; close: () => void; deviceName?: string;
}) {
  const { entries, service, tunnels } = usePortMappings(props);
  const [preview, setPreview] = useState<string>();
  const selected = entries.find(entry => entry.id === preview && entry.status === 'running');
  useEffect(() => { if (!props.active || !selected) setPreview(undefined); }, [props.active, selected]);
  const tunnel = selected && tunnels.get(selected.id);
  return <>
    <AdaptiveSheet open={props.active && props.open && !selected} title={t('端口映射')}
      subtitle={props.deviceName} width={400} onClose={props.close}>
      <section className="port-mappings" aria-label={t('端口映射设置')}>
        <p>{t('通过远程电脑访问目标 IP 和端口。留空 IP 可访问远程电脑本机。')}</p>
        {!props.connected && <Alert type="info" message={t('连接已断开，重新连接后可再次启动。')} />}
        {!entries.length && <p>{t('还没有端口映射')}</p>}
        {entries.map(entry => <MappingRow key={entry.id} entry={entry} service={service}
          connected={props.connected} preview={() => setPreview(entry.id)} />)}
        <MappingForm service={service} disabled={!props.connected || entries.length >= MAX_PORT_MAPPINGS} />
        <p>{t('网页映射仅在当前页面中使用。关闭页面或切换电脑后会停止。')}</p>
      </section>
    </AdaptiveSheet>
    {selected && tunnel && props.active && <MappingPreview key={selected.id} origin={mappingOrigin(selected)}
      tunnel={tunnel} close={() => setPreview(undefined)} />}
  </>;
}

function MappingForm({ service, disabled }: { service: PortForwardingService; disabled: boolean }) {
  const [remoteHost, setRemoteHost] = useState('');
  const [port, setPort] = useState<number | null>(null);
  const [error, setError] = useState('');
  return <form className="port-mapping-form" onSubmit={event => {
    event.preventDefault();
    if (disabled) return;
    try { service.add(port ?? 0, port ?? 0, remoteHost); setRemoteHost(''); setPort(null); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '端口映射未能添加，请重试。'); }
  }}>
    <label>{t('目标 IP')}<Input aria-label={t('目标 IP')} value={remoteHost}
      onChange={event => setRemoteHost(event.target.value)} placeholder={DEFAULT_MAPPING_HOST} disabled={disabled}
      autoComplete="off" spellCheck={false} /></label>
    <label>{t('远程端口')}<InputNumber aria-label={t('远程端口')} min={1} max={MAX_PORT}
      value={port} onChange={setPort} placeholder="3000" disabled={disabled} /></label>
    {error && <p role="alert">{t(error)}</p>}
    <Button type="primary" htmlType="submit" disabled={disabled} block>{t('添加并启动')}</Button>
  </form>;
}

function MappingRow({ entry, service, connected, preview }: {
  entry: ForwardingEntry; service: PortForwardingService; connected: boolean; preview: () => void;
}) {
  const running = entry.status === 'running';
  const busy = entry.status === 'starting' || entry.status === 'stopping';
  return <article aria-label={mappingAddress(entry)} className="port-mapping-row">
    <div><strong>{mappingAddress(entry)}</strong><span role="status">{t(STATUS[entry.status])}</span></div>
    <Button type="link" className="port-mapping-address" disabled={!running} onClick={preview}>
      <span>{mappingOrigin(entry)}</span><span aria-hidden="true">›</span></Button>
    <div>
      <Button disabled={!running} onClick={preview}>{t('在 Remote AI 中预览')}</Button>
      <Button disabled={entry.status === 'stopping' || (!connected && !running && !busy)}
        onClick={() => { void (running || busy ? service.stop(entry.id) : service.start(entry.id)); }}>
        {t(running || busy ? '停止映射' : '启动映射')}</Button>
      <Button disabled={entry.status === 'stopping'} onClick={() => { void service.remove(entry.id); }}>
        {t('删除映射')}</Button>
    </div>
    {entry.error && <p role="alert">{t(entry.error)}</p>}
  </article>;
}
