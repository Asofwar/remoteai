import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../../i18n';
import { useThemeColor } from '../../theme/store';
import { useActivitySweep } from '../useActivitySweep';

export function MappingPreviewActivity({ active }: { active: boolean }) {
  const color = useThemeColor();
  const { progress } = useActivitySweep(active);
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <View style={styles.slot}>
    {active && <Animated.View accessible accessibilityRole="progressbar"
      accessibilityLabel={t('正在加载网页…')} accessibilityState={{ busy: true }}
      style={{ transform: [{ rotate }] }}>
      <Ionicons name="refresh-outline" size={22} color={color('#0b8065', 'accent')} />
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  slot: { width: 28, height: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
});
