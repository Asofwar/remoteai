import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useConnectionInfoStyles } from './connectionInfoStyles';

const DOT_INTERVAL_MS = 400;
const DOTS = ['.', '..', '...'];
const MILLISECONDS_PER_SECOND = 1000;

export function ChatReconnectButton({ retryAt, onPress }: { retryAt: number | null; onPress: () => void }) {
  const styles = useConnectionInfoStyles();
  useLanguage();
  const [tick, setTick] = useState({ now: Date.now(), dots: 0 });
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => ({ now: Date.now(), dots: (value.dots + 1) % DOTS.length })),
      DOT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  const seconds = retryAt === null ? null : Math.max(0, Math.ceil((retryAt - tick.now) / MILLISECONDS_PER_SECOND));
  return <Pressable accessibilityRole="button" accessibilityLabel={t("立即连接")} onPress={onPress}
    style={styles.action}>
    <Text style={styles.actionText}>
      {t("立即连接")}{seconds === null ? '' : t("（{value1}秒）", { value1: seconds })}{DOTS[tick.dots]}</Text>
  </Pressable>;
}
