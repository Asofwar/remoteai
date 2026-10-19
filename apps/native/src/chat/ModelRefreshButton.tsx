import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { t } from '../i18n';
import { createThemedStyles } from '../theme/styles';
import { useThemeColor } from '../theme/store';

export function ModelRefreshButton({ ready, refreshModels }: { ready: boolean; refreshModels: () => Promise<void> }) {
  const styles = useStyles();
  const color = useThemeColor();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!ready || refreshing) return;
    setRefreshing(true);
    try { await refreshModels(); } finally { setRefreshing(false); }
  };
  return <Pressable accessibilityRole="button" hitSlop={5} disabled={!ready || refreshing}
    accessibilityLabel={t(refreshing ? '正在刷新模型…' : '刷新模型')}
    style={({ pressed }) => [styles.button, (!ready || refreshing || pressed) && styles.dimmed]}
    accessibilityState={{ disabled: !ready || refreshing, busy: refreshing }} onPress={() => { void refresh(); }}>
    {refreshing ? <ActivityIndicator size="small" color={color('#147d6b', 'accent')} />
      : <Feather name="refresh-cw" size={18} color={color('#147d6b', 'accent')} accessible={false} />}
  </Pressable>;
}

const useStyles = createThemedStyles((color) => ({
  button: { width: 34, height: 34, flexShrink: 0, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color('#eef3f0', 'canvas') },
  dimmed: { opacity: 0.55 },
}));
