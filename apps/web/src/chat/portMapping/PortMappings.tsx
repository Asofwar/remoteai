import { useEffect, useState } from 'react';
import { Alert, Button } from 'antd';
import { ArrowDownWideNarrow, ArrowLeftRight, Info } from 'lucide-react';
import type { ForwardingClient, ForwardingEntry } from '../../../../../shared/port-mapping/service';
import { MAX_PORT_MAPPINGS } from '../../../../../shared/port-mapping/settings';
import { mappingOrigin } from '../../../../../shared/port-mapping/target';
import { AdaptiveSheet } from '../../components/AdaptiveSheet';
import { t } from '../../i18n';
import { usePortMappings } from './usePortMappings';
import { MappingPreview } from './MappingPreview';
import { MappingForm } from './MappingForm';
import { MappingRow } from './MappingRow';
import './portMapping.css';

export function PortMappings(props: {
  client: ForwardingClient; scope: string; connected: boolean; active: boolean;
  open: boolean; close: () => void; deviceName?: string;
}) {
  const { entries, service, tunnels, syncStatus } = usePortMappings(props);
  const [preview, setPreview] = useState<string>();
  const [editing, setEditing] = useState<ForwardingEntry>();
  const [newestFirst, setNewestFirst] = useState(false);
  const selected = entries.find(entry => entry.id === preview && entry.status === 'running');
  useEffect(() => { if (!props.active || !props.open || !selected) setPreview(undefined); },
    [props.active, props.open, selected]);
  useEffect(() => { setEditing(undefined); }, [service]);
  const tunnel = selected && tunnels.get(selected.id);
  const sorted = [...entries].sort((a, b) => newestFirst ? (b.updatedAt ?? 0) - (a.updatedAt ?? 0) : 0);
  return <>
    <AdaptiveSheet open={props.active && props.open && !selected} title={t('端口映射')}
      titleIcon={<span className="mapping-hero-icon"><ArrowLeftRight size={25} /></span>}
      subtitle={t('通过远程电脑访问目标 IP 和端口')} width={540} onClose={props.close} className="mapping-sheet">
      <section className="port-mappings" aria-label={t('端口映射设置')}>
        <div className="mapping-info"><Info size={20} /><p>
          {t('添加远程端口，点击地址即可在此预览网页。')}
          {t('留空 IP 可访问远程电脑本机。')}</p></div>
        {!props.connected && <Alert type="info" message={t('连接已断开，重新连接后可再次启动。')} />}
        <header className="mapping-list-heading"><strong>{t('当前映射')} ({entries.length})</strong>
          <Button type="text" aria-label={t('按编辑时间排序')} aria-pressed={newestFirst}
            icon={<ArrowDownWideNarrow size={19} />} onClick={() => setNewestFirst(!newestFirst)} /></header>
        {!entries.length && <p className="mapping-empty">{t('还没有端口映射')}</p>}
        {sorted.map(entry => editing?.id === entry.id
          ? <MappingForm key={entry.id} service={service} entry={editing} done={() => setEditing(undefined)} />
          : <MappingRow key={entry.id} entry={entry} service={service} edit={() => setEditing(entry)}
            connected={props.connected} preview={() => setPreview(entry.id)} />)}
        {editing && !entries.some(entry => entry.id === editing.id) && <Button onClick={() => setEditing(undefined)}>
          {t('该映射已被删除，请重新添加。')}</Button>}
        {!editing && <MappingForm service={service} disabled={entries.length >= MAX_PORT_MAPPINGS}
          connected={props.connected} />}
        <p className="mapping-footer">{t('网页映射仅在当前页面中使用。关闭页面或切换电脑后会停止。')}</p>
        {syncStatus && <p className="mapping-sync" role="status">{t(syncStatus)}</p>}
      </section>
    </AdaptiveSheet>
    {selected && tunnel && props.active && props.open && <MappingPreview
      key={`${selected.id}:${selected.updatedAt}`} origin={mappingOrigin(selected)}
      tunnel={tunnel} close={() => setPreview(undefined)} />}
  </>;
}
