import { Button, Dropdown, Switch } from 'antd';
import { ExternalLink, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { ForwardingEntry, PortForwardingService } from '../../../../../shared/port-mapping/service';
import { DEFAULT_MAPPING_HOST, mappingAddress, mappingOrigin } from '../../../../../shared/port-mapping/target';
import { t } from '../../i18n';

export function MappingRow({ entry, service, connected, preview, edit }: {
  entry: ForwardingEntry; service: PortForwardingService; connected: boolean; preview: () => void; edit: () => void;
}) {
  const running = entry.status === 'running';
  const busy = entry.status === 'starting' || entry.status === 'stopping';
  const details = [['目标 IP', entry.remoteHost || DEFAULT_MAPPING_HOST], ['远程端口', entry.remotePort],
    ['本地端口', entry.localPort], ['编辑时间', entry.updatedAt ? new Date(entry.updatedAt).toLocaleString(undefined,
      { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—']];
  return <article aria-label={mappingAddress(entry)} className="port-mapping-row">
    <header className="mapping-card-heading"><span className="mapping-address-label">{t('访问地址')}</span>
      <Switch checked={running || busy} aria-label={t(running || busy ? '停止映射' : '启动映射')}
        loading={entry.status === 'stopping'} disabled={!connected && !running && !busy}
        onChange={() => { void (running || busy ? service.stop(entry.id) : service.start(entry.id)); }} />
      <Dropdown trigger={['click']} menu={{ items: [
        { key: 'edit', label: t('编辑映射'), icon: <Pencil size={15} />, disabled: busy, onClick: edit },
        { key: 'delete', label: t('删除映射'), icon: <Trash2 size={15} />, danger: true,
          disabled: entry.status === 'stopping', onClick: () => { void service.remove(entry.id); } },
      ] }}><Button type="text" aria-label={t('更多操作')} icon={<MoreVertical size={20} />} /></Dropdown>
    </header>
    <div className="mapping-access"><Button type="text" className="port-mapping-address" disabled={!running}
      aria-label={mappingOrigin(entry)} onClick={preview}>{mappingOrigin(entry)}</Button>
      <Button className="mapping-open" disabled={!running} onClick={preview} aria-label={t('在 Remote AI 中预览')}
        icon={<ExternalLink size={18} />}>{t('打开')}</Button></div>
    <dl className="mapping-details">{details.map(([label, value]) => <div key={label}>
      <dt>{t(String(label))}</dt><dd>{value}</dd></div>)}</dl>
    {entry.error && <p role="alert">{t(entry.error)}</p>}
  </article>;
}
