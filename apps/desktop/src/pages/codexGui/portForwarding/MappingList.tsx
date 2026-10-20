import { Button } from 'antd';
import { Cable, Plus } from 'lucide-react';
import { guiText as t } from '../../../i18n/guiText';
import { MappingRow } from './MappingRow';
import type { ForwardingEntry, PortForwardingService } from './service';
import styles from './portForwarding.module.less';

export function MappingList({ entries, service, connected, create, edit, onOpen }: {
  entries: ForwardingEntry[]; service: PortForwardingService; connected: boolean;
  create: () => void; edit: (entry: ForwardingEntry) => void; onOpen: () => void;
}) {
  if (!entries.length) return <div className={styles.empty}>
    <Cable size={32} aria-hidden="true" />
    <span>{t('还没有端口映射')}</span>
    <Button type="primary" className={styles.create} icon={<Plus size={16} aria-hidden="true" />}
      onClick={create}>{t('新建映射')}</Button>
  </div>;
  return <>
    <div className={styles.columns} aria-hidden="true">
      <span>{t('本机访问')}</span><span /><span>{t('远程目标')}</span>
    </div>
    <div className={styles.list}>
      {entries.map(entry => <MappingRow key={entry.id} entry={entry} service={service}
        connected={connected} edit={() => edit(entry)} onOpen={onOpen} />)}
    </div>
  </>;
}
