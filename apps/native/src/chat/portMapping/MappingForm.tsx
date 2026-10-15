import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { ForwardingEntry, PortForwardingService } from '../../../../../shared/port-mapping/service';
import { t } from '../../i18n';
import { useMappingStyles } from './mappingStyles';

export function MappingForm({ service, disabled, connected = true, entry, done }: {
  service: PortForwardingService; disabled?: boolean; connected?: boolean; entry?: ForwardingEntry; done?: () => void;
}) {
  const styles = useMappingStyles();
  const [remoteHost, setRemoteHost] = useState(entry?.remoteHost ?? '');
  const [remote, setRemote] = useState(entry ? String(entry.remotePort) : '');
  const [local, setLocal] = useState(entry ? String(entry.localPort) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const reset = () => { setRemoteHost(''); setRemote(''); setLocal(''); setError(''); done?.(); };
  const submit = async () => {
    if (disabled || saving) return;
    setSaving(true);
    try {
      const target = { remoteHost, remotePort: Number(remote), localPort: Number(local || remote) };
      if (entry) await service.edit(entry.id, target);
      else service.add(target.remotePort, target.localPort, target.remoteHost);
      reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '映射未能保存，请重试。'); }
    finally { setSaving(false); }
  };
  const locked = disabled || saving;
  return <View style={styles.form}>
    <Text style={styles.title}>{t(entry ? '编辑映射' : '添加映射')}</Text>
    <View style={styles.fields}>
      <View style={styles.hostField}><Text style={styles.muted}>{t('目标 IP')}</Text>
        <TextInput accessibilityLabel={t('目标 IP')} value={remoteHost} onChangeText={setRemoteHost}
          autoCapitalize="none" autoCorrect={false} placeholder="192.168.1.100" placeholderTextColor="#8a9bad"
          style={styles.input} editable={!locked} /></View>
      <View style={styles.portField}><Text style={styles.muted}>{t('远程端口')}</Text>
        <TextInput accessibilityLabel={t('远程端口')} value={remote} onChangeText={setRemote}
          keyboardType="number-pad" maxLength={5} placeholder="8080" placeholderTextColor="#8a9bad"
          style={styles.input} editable={!locked} /></View>
      <View style={styles.portField}><Text style={styles.muted}>{t('本地端口')}</Text>
        <TextInput accessibilityLabel={t('本地端口')} value={local} onChangeText={setLocal}
          keyboardType="number-pad" maxLength={5} placeholder={remote || t('默认同远程端口')}
          placeholderTextColor="#8a9bad" style={styles.input} editable={!locked} /></View>
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text>}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={reset} disabled={saving} style={styles.button}>
        <Text style={styles.buttonText}>{t('取消')}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={locked} onPress={() => { void submit(); }}
        style={[styles.button, styles.primary, locked && styles.disabled]}>
        <Text style={styles.primaryText}>{t(entry ? '保存修改' : connected ? '添加并启动' : '添加映射')}</Text>
      </Pressable>
    </View>
  </View>;
}
