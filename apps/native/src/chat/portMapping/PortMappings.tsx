import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { ForwardingClient, ForwardingEntry, PortForwardingService }
  from '../../../../../shared/port-mapping/service';
import { MAX_PORT_MAPPINGS } from '../../../../../shared/port-mapping/settings';
import { DEFAULT_MAPPING_HOST, mappingAddress } from '../../../../../shared/port-mapping/target';
import { BottomSheet } from '../../components/BottomSheet';
import { SheetScrollView } from '../../components/SheetScrollView';
import { t } from '../../i18n';
import { useStyles } from '../styles';
import { usePortMappings } from './usePortMappings';
import { MappingPreview } from './MappingPreview';
import { MappingOpenActions } from './MappingOpenActions';

const STATUS = { stopped: '已停止', starting: '正在启动…', running: '映射中',
  stopping: '正在停止…', error: '启动失败' } as const;

export function PortMappings(props: {
  client: ForwardingClient; scope: string; connected: boolean; active: boolean;
  open: boolean; close: () => void; deviceName?: string;
}) {
  const styles = useStyles();
  const { entries, service } = usePortMappings(props);
  const [selection, setSelection] = useState<{ id: string; view: 'actions' | 'preview' }>();
  const selected = entries.find(entry => entry.id === selection?.id && entry.status === 'running');
  const previewing = !!selected && selection?.view === 'preview';
  const closeActions = () => setSelection(undefined);
  useEffect(() => {
    if (!props.active || !props.open || !selected) setSelection(undefined);
  }, [props.active, props.open, selected]);
  return <>
    <BottomSheet visible={props.active && props.open && !previewing}
      title={t(selected ? '打开映射地址' : '端口映射')}
      subtitle={selected ? `http://127.0.0.1:${selected.localPort}` : props.deviceName}
      onClose={selected ? closeActions : props.close} onBack={selected ? closeActions : undefined} maxWidth={400}>
      {selected ? <MappingOpenActions key={selected.id} port={selected.localPort}
        preview={() => setSelection({ id: selected.id, view: 'preview' })} opened={closeActions} /> :
      <SheetScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>{t('通过远程电脑访问目标 IP 和端口。留空 IP 可访问远程电脑本机。')}</Text>
        <Text style={styles.subtitle}>{t('映射启动后，点击地址可选择应用内预览或浏览器打开。')}</Text>
        {!props.connected && <Text style={styles.subtitle}>{t('连接已断开，重新连接后可再次启动。')}</Text>}
        {!entries.length && <Text style={styles.subtitle}>{t('还没有端口映射')}</Text>}
        {entries.map(entry => <MappingRow key={entry.id} entry={entry} service={service}
          connected={props.connected} open={() => setSelection({ id: entry.id, view: 'actions' })} />)}
        <MappingForm service={service} disabled={!props.connected || entries.length >= MAX_PORT_MAPPINGS} />
        <Text style={styles.subtitle}>{t('支持 TCP，仅本机可访问。')}</Text>
        {Platform.OS === 'ios' && <Text style={styles.subtitle}>
          {t('切到其他应用后，映射可能中断，建议在此预览。')}</Text>}
      </SheetScrollView>}
    </BottomSheet>
    {selected && previewing && props.active && props.open && <MappingPreview
      key={selected.id} port={selected.localPort} close={closeActions} />}
  </>;
}

function MappingForm({ service, disabled }: { service: PortForwardingService; disabled: boolean }) {
  const styles = useStyles();
  const [remoteHost, setRemoteHost] = useState('');
  const [remote, setRemote] = useState('');
  const [local, setLocal] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    if (disabled) return;
    try {
      service.add(Number(remote), Number(local || remote), remoteHost);
      setRemoteHost(''); setRemote(''); setLocal(''); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '端口映射未能添加，请重试。'); }
  };
  return <View style={{ gap: 10 }}>
    <View><Text style={styles.subtitle}>{t('目标 IP')}</Text>
      <TextInput accessibilityLabel={t('目标 IP')} value={remoteHost} onChangeText={setRemoteHost}
        autoCapitalize="none" autoCorrect={false} placeholder={DEFAULT_MAPPING_HOST}
        style={styles.search} editable={!disabled} />
    </View>
    <View style={styles.row}>
      <View style={styles.fill}><Text style={styles.subtitle}>{t('远程端口')}</Text>
        <TextInput accessibilityLabel={t('远程端口')} value={remote} onChangeText={setRemote}
          keyboardType="number-pad" maxLength={5} placeholder="3000" style={styles.search} editable={!disabled} />
      </View>
      <View style={styles.fill}><Text style={styles.subtitle}>{t('本地端口')}</Text>
        <TextInput accessibilityLabel={t('本地端口')} value={local} onChangeText={setLocal}
          keyboardType="number-pad" maxLength={5} placeholder={remote || t('默认同远程端口')}
          style={styles.search} editable={!disabled} />
      </View>
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text>}
    <Pressable accessibilityRole="button" disabled={disabled} onPress={add}
      style={[styles.button, styles.primary, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, styles.primaryText]}>{t('添加并启动')}</Text></Pressable>
  </View>;
}

function MappingRow({ entry, service, connected, open }: {
  entry: ForwardingEntry; service: PortForwardingService; connected: boolean; open: () => void;
}) {
  const styles = useStyles();
  const [notice, setNotice] = useState('');
  const running = entry.status === 'running';
  const busy = entry.status === 'starting' || entry.status === 'stopping';
  const copy = async () => {
    try { await Clipboard.setStringAsync(`127.0.0.1:${entry.localPort}`); setNotice('本地地址已复制'); }
    catch { setNotice('复制失败，请重试。'); }
  };
  return <View style={styles.card}>
    <View style={styles.row}>
      <Text style={[styles.title, { flex: 1 }]}>{mappingAddress(entry)} → {entry.localPort}</Text>
      <Text style={styles.subtitle}>{t(STATUS[entry.status])}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('删除映射')}
        style={[styles.button, { paddingHorizontal: 10 }]} disabled={entry.status === 'stopping'}
        onPress={() => { void service.remove(entry.id); }}>
        <Text style={styles.buttonText}>×</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`127.0.0.1:${entry.localPort}`}
      accessibilityHint={t('选择应用内预览或浏览器打开')} disabled={!running} onPress={open}
      style={[styles.button, styles.row, !running && styles.disabled]}>
      <Text style={[styles.buttonText, { flex: 1 }]}>127.0.0.1:{entry.localPort}</Text>
      <Text style={styles.buttonText}>{t('打开')} ›</Text></Pressable>
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      <Pressable accessibilityRole="button" style={[styles.button, !running && styles.disabled]}
        disabled={!running} onPress={() => { void copy(); }}>
        <Text style={styles.buttonText}>{t('复制本地地址')}</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.button}
        disabled={entry.status === 'stopping' || (!connected && !running && !busy)}
        onPress={() => { void (running || busy ? service.stop(entry.id) : service.start(entry.id)); }}>
        <Text style={styles.buttonText}>{t(running || busy ? '停止映射' : '启动映射')}</Text></Pressable>
    </View>
    {!!entry.error && <Text accessibilityRole="alert" style={styles.error}>{t(entry.error)}</Text>}
    {!!notice && <Text style={styles.subtitle}>{t(notice)}</Text>}
  </View>;
}
