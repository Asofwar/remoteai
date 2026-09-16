import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { UploadProgress } from '../../../../shared/remote-chat/uploadProgress';

export function ComposerUploadProgress({ progress, reconnecting }: {
  progress?: UploadProgress; reconnecting: boolean;
}) {
  if (!progress) return null;
  const label = reconnecting ? '连接恢复后继续上传…' : {
    preparing: '正在准备上传…', uploading: `正在上传附件 ${progress.percent}%`,
    confirming: '上传完成，等待电脑确认…',
  }[progress.phase];
  return <View style={styles.container}>
    <View style={styles.heading}>
      <ActivityIndicator size="small" color="#238578" />
      <Text style={styles.label}>{label}</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: progress.percent }} style={styles.track}>
      <View style={[styles.fill, { width: `${progress.percent}%` }]} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 400, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 7 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: '#28766c', fontSize: 13, flexShrink: 1 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#e1eeeb', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: '#238578' },
});
