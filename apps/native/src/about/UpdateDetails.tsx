import { Text, View } from 'react-native';
import type { useAppUpdate } from './useAppUpdate';
import { styles } from './styles';

type UpdateState = ReturnType<typeof useAppUpdate>;
const MAX_RELEASE_NOTES_LENGTH = 900;

function DownloadStatus({ update }: { update: UpdateState }) {
  const state = update.downloadState;
  if (state.status === 'idle') return null;
  if (state.status === 'downloading') return <View style={styles.status}>
    <Text style={styles.statusTitle}>正在下载 v{state.version}</Text>
    <Text style={styles.detail}>可以离开此页面，在通知栏查看下载进度。</Text>
  </View>;
  if (state.status === 'failed') return <View style={styles.status}>
    <Text style={[styles.statusTitle, styles.error]}>v{state.version} 下载失败</Text>
    <Text style={styles.detail}>下载未完成，请检查网络后点击“重新下载”。</Text>
  </View>;
  return <View style={styles.status}>
    <Text style={styles.statusTitle}>v{state.version} 已下载</Text>
    <Text style={styles.detail}>更新已准备好，可以开始安装。</Text>
  </View>;
}

function ReleaseDetails({ update }: { update: UpdateState }) {
  const result = update.updateCheck;
  if (!result) return null;
  const { release, updateAvailable } = result;
  const notes = release.notes.replace(/\r/g, '').trim() || '本次版本未提供更新说明。';
  const compactNotes = notes.length > MAX_RELEASE_NOTES_LENGTH
    ? `${notes.slice(0, MAX_RELEASE_NOTES_LENGTH).trimEnd()}…` : notes;
  return <View style={styles.status}>
    <View style={styles.statusHeading}>
      <Text style={styles.statusTitle}>最新版本 v{release.version}</Text>
      <Text style={styles.statusLabel}>{updateAvailable ? '可更新' : '已是最新'}</Text>
    </View>
    {release.publishedAt ? <Text style={styles.detail}>
      发布于 {new Date(release.publishedAt).toLocaleDateString('zh-CN')}
    </Text> : null}
    {updateAvailable ? <Text style={styles.detail}>{compactNotes}</Text> : null}
  </View>;
}

export function UpdateDetails({ update }: { update: UpdateState }) {
  if (update.error) return <View style={styles.updateDetails}>
    <Text accessibilityRole="alert" style={[styles.detail, styles.error]}>{update.error}</Text>
  </View>;
  if (!update.updateCheck && update.downloadState.status === 'idle') return null;
  if (!update.updateCheck?.updateAvailable && update.downloadState.status === 'idle') return null;
  return <View style={styles.updateDetails}>
    <DownloadStatus update={update} />
    <ReleaseDetails update={update} />
  </View>;
}
