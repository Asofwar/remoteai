import { Button } from 'antd';
import { Cable, Plus } from 'lucide-react';
import { guiText as t } from '../../../i18n/guiText';
import { MappingRow } from './MappingRow';
import { MAX_PORT_MAPPINGS } from './settings';
import type { ForwardingEntry, PortForwardingService } from './service';
import styles from './portForwarding.module.less';

export function MappingList({ entries, service, connected, edit, create, onOpen }: {
  entries: ForwardingEntry[]; service: PortForwardingService; connected: boolean;
  edit: (entry: ForwardingEntry) => void; create: () => void; onOpen: () => void;
}) {
  return <>
    {entries.length > 0 && <div className={styles.columns} aria-hidden="true">
      <span>{t('本机访问')}</span><span /><span>{t('远程目标')}</span>
    </div>}
    <div className={styles.list}>
      {entries.map(entry => <MappingRow key={entry.id} entry={entry} service={service}
        connected={connected} edit={() => edit(entry)} onOpen={onOpen} />)}
      {!entries.length && <div className={styles.empty}><Cable size={32} aria-hidden="true" />
        <span>{t('还没有端口映射')}</span></div>}
    </div>
    <Button type="primary" block className={styles.primary} icon={<Plus size={20} />}
      disabled={entries.length >= MAX_PORT_MAPPINGS} onClick={create}>{t('新建映射')}</Button>
  </>;
}
