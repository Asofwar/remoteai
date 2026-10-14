import { useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { t } from '../../i18n';
import { useStyles } from '../styles';

export function MappingOpenActions({ port, preview, opened }: {
  port: number; preview: () => void; opened: () => void;
}) {
  const styles = useStyles();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const openBrowser = async () => {
    if (opening) return;
    setOpening(true);
    setError('');
    try {
      await Linking.openURL(`http://127.0.0.1:${port}`);
      opened();
    } catch {
      setError('无法打开浏览器，请重试。');
    } finally { setOpening(false); }
  };
  return <View style={{ gap: 10, paddingBottom: 16 }}>
    <Pressable accessibilityRole="button" disabled={opening} onPress={preview}
      style={[styles.button, styles.primary, opening && styles.disabled]}>
      <Text style={[styles.buttonText, styles.primaryText]}>{t('在 Remote AI 中预览')}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={opening} onPress={() => { void openBrowser(); }}
      style={[styles.button, opening && styles.disabled]}>
      <Text style={styles.buttonText}>{t('在浏览器中打开')}</Text>
    </Pressable>
    {Platform.OS === 'ios' && <Text style={styles.subtitle}>
      {t('切到其他应用后，映射可能中断，建议在此预览。')}</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text>}
  </View>;
}
