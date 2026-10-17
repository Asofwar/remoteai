import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { t } from '../i18n';
import { useStyles } from './styles';

export function ModelRefreshButton({ ready, refreshModels }: { ready: boolean; refreshModels: () => Promise<void> }) {
  const styles = useStyles();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshModels(); } finally { setRefreshing(false); }
  };
  return <Pressable accessibilityRole="button" style={styles.button} disabled={!ready || refreshing}
    accessibilityState={{ disabled: !ready || refreshing, busy: refreshing }} onPress={() => { void refresh(); }}>
    <Text style={styles.buttonText}>{t(refreshing ? '正在刷新模型…' : '刷新模型')}</Text>
  </Pressable>;
}
