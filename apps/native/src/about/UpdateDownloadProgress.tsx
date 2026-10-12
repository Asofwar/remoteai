import { ActivityIndicator, Text, View } from 'react-native';
import { t, useLanguage } from '../i18n';
import { formatBytes } from '../downloads/presentation';
import { updateDownloadPercent, type AndroidDownloadProgress } from '../update/androidDownloadProgress';
import { useStyles } from './styles';

export function UpdateDownloadProgress({ progress }: { progress?: AndroidDownloadProgress }) {
  const styles = useStyles();
  useLanguage();
  const percent = updateDownloadPercent(progress);
  const verifying = progress?.phase === 'verifying';
  const label = verifying ? t('正在校验') : t('下载进度');
  return <View style={styles.progressDetails}>
    <View style={styles.statusHeading}>
      <Text style={styles.detail}>{label}</Text>
      {percent === null ? <ActivityIndicator size="small" />
        : <Text style={styles.statusLabel}>{percent}%</Text>}
    </View>
    {percent !== null ? <View accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }} style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${percent}%` }]} />
    </View> : null}
    {progress ? <View style={styles.progressNumbers}>
      <Text style={styles.detail}>{formatBytes(progress.receivedBytes)}
        {progress.totalBytes > 0 ? ` / ${formatBytes(progress.totalBytes)}` : ''}</Text>
      {!verifying ? <Text style={styles.detail}>{formatBytes(progress.bytesPerSecond)}/s</Text> : null}
    </View> : null}
    <Text style={styles.detail}>{t('可以继续使用应用，在此页面或通知栏查看进度。')}</Text>
  </View>;
}
