import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ForwardingClient, ForwardingEntry } from '../../../../../shared/port-mapping/service';
import { MAX_PORT_MAPPINGS } from '../../../../../shared/port-mapping/settings';
import { BottomSheet } from '../../components/BottomSheet';
import { SheetScrollView } from '../../components/SheetScrollView';
import type { AuthSession } from '../../types';
import { t } from '../../i18n';
import { usePortMappings } from './usePortMappings';
import { MappingPreview } from './MappingPreview';
import { MappingOpenActions } from './MappingOpenActions';
import { MappingForm } from './MappingForm';
import { MappingRow } from './MappingRow';
import { useMappingStyles } from './mappingStyles';

export function PortMappings(props: {
  client: ForwardingClient; scope: string; connected: boolean; active: boolean; session?: AuthSession;
  open: boolean; close: () => void; deviceName?: string;
}) {
  const styles = useMappingStyles();
  const { entries, service, syncStatus } = usePortMappings(props);
  const [selection, setSelection] = useState<{ id: string; view: 'actions' | 'preview' }>();
  const [editing, setEditing] = useState<ForwardingEntry>();
  const [newestFirst, setNewestFirst] = useState(false);
  const selected = entries.find(entry => entry.id === selection?.id && entry.status === 'running');
  const previewing = !!selected && selection?.view === 'preview';
  const closeActions = () => setSelection(undefined);
  useEffect(() => {
    if (!props.active || !props.open || !selected) setSelection(undefined);
  }, [props.active, props.open, selected]);
  useEffect(() => { setEditing(undefined); }, [service]);
  const sorted = [...entries].sort((a, b) => newestFirst ? (b.updatedAt ?? 0) - (a.updatedAt ?? 0) : 0);
  return <>
    <BottomSheet visible={props.active && props.open && !previewing}
      title={t(selected ? '打开映射地址' : '端口映射')}
      titleIcon={!selected && <View style={styles.heroIcon}>
        <Ionicons name="swap-horizontal-outline" size={26} color="#008b73" /></View>}
      subtitle={selected ? `http://127.0.0.1:${selected.localPort}` : t('通过远程电脑访问目标 IP 和端口')}
      onClose={selected ? closeActions : props.close} onBack={selected ? closeActions : undefined} maxWidth={540}>
      {selected ? <MappingOpenActions key={selected.id} port={selected.localPort}
        preview={() => setSelection({ id: selected.id, view: 'preview' })} opened={closeActions} /> :
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}><Ionicons name="information-circle" size={21} color="#008b73" />
          <Text style={[styles.muted, styles.fill]}>
            {t('映射启动后，点击地址可选择应用内预览或浏览器打开。留空 IP 可访问远程电脑本机。')}</Text></View>
        {!props.connected && <Text style={styles.muted}>{t('连接已断开，重新连接后可再次启动。')}</Text>}
        <View style={styles.row}><Text style={[styles.sectionTitle, styles.fill]}>
          {t('当前映射')} ({entries.length})</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('按编辑时间排序')}
            accessibilityState={{ selected: newestFirst }} style={styles.iconButton}
            onPress={() => setNewestFirst(!newestFirst)}>
            <Ionicons name="swap-vertical" size={21} color={newestFirst ? '#008b73' : '#718078'} /></Pressable></View>
        {!entries.length && <Text style={styles.empty}>{t('还没有端口映射')}</Text>}
        {sorted.map(entry => editing?.id === entry.id
          ? <MappingForm key={entry.id} service={service} entry={editing} done={() => setEditing(undefined)} />
          : <MappingRow key={entry.id} entry={entry} service={service} connected={props.connected}
            edit={() => setEditing(entry)} open={() => setSelection({ id: entry.id, view: 'actions' })} />)}
        {editing && !entries.some(entry => entry.id === editing.id) && <Pressable accessibilityRole="button"
          onPress={() => setEditing(undefined)}><Text style={styles.muted}>
          {t('该映射已被删除，请重新添加。')}</Text></Pressable>}
        {!editing && <MappingForm service={service} disabled={entries.length >= MAX_PORT_MAPPINGS}
          connected={props.connected} />}
        <Text style={styles.footer}>{t('支持 TCP，仅本机可访问。')}</Text>
        {!!syncStatus && <Text style={styles.sync}>{t(syncStatus)}</Text>}
        {Platform.OS === 'ios' && <Text style={styles.muted}>
          {t('切到其他应用后，映射可能中断，建议在此预览。')}</Text>}
      </SheetScrollView>}
    </BottomSheet>
    {selected && previewing && props.active && props.open && <MappingPreview
      key={`${selected.id}:${selected.updatedAt}`} port={selected.localPort} close={closeActions} />}
  </>;
}
