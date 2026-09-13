import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomSheet } from '../components/BottomSheet';
import { copyText, saveTextFile } from './copyText';
import { palette, styles } from './styles';

interface ExportRequest { text: string; reason: 'too-large' | 'failed' }

function useTextCopy(text: string) {
  const [status, setStatus] = useState('');
  const [request, setRequest] = useState<ExportRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; clearTimeout(timer.current);
  }; }, []);
  const notice = (value: string) => {
    if (!mounted.current) return;
    setStatus(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 2000);
  };
  const copy = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await copyText(text);
      if (!mounted.current) return;
      if (result === 'copied') notice('已复制');
      else if (Platform.OS === 'android') { setError(''); setRequest({ text, reason: result }); }
      else notice('复制失败，请重试');
    } finally { busy.current = false; }
  };
  const save = async () => {
    if (!request || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const result = await saveTextFile(request.text);
      if (result && mounted.current) {
        setRequest(null);
        notice(result.location === 'downloads' ? '已保存到下载文件夹' : '已保存到所选文件夹');
      }
    } catch { if (mounted.current) setError('保存失败，请重试。'); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  return { status, request, saving, error, copy, save, close: () => setRequest(null) };
}

export function CopyTextButton({ text, label = '复制' }: { text: string; label?: string }) {
  const copy = useTextCopy(text);
  return <><Pressable accessibilityRole="button" accessibilityLabel={label} style={copyStyles.button}
    disabled={copy.saving} onPress={() => void copy.copy()}>{copy.status
      ? <Text style={[styles.subtitle, { maxWidth: 400 }]}>{copy.status}</Text>
      : <Feather name="copy" size={15} color={palette.muted} />}</Pressable>
    {copy.request && <BottomSheet visible title="保存完整内容" onClose={copy.close} dismissible={!copy.saving}
      actions={[{ label: '保存完整内容', onPress: copy.save, loading: copy.saving, disabled: copy.saving }]}>
      <Text style={[styles.messageText, { maxWidth: 400 }]}>{copy.request.reason === 'too-large'
        ? '内容较长，可将完整内容保存为文本文件。' : '复制未成功，可将完整内容保存为文本文件。'}</Text>
      {!!copy.error && <Text accessibilityRole="alert" style={styles.error}>{copy.error}</Text>}
    </BottomSheet>}
  </>;
}

const copyStyles = StyleSheet.create({
  button: { minWidth: 36, minHeight: 36, padding: 8, alignItems: 'center', justifyContent: 'center' },
});
