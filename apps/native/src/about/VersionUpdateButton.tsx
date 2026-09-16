import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import type { useAppUpdate } from './useAppUpdate';
import { styles } from './styles';
import { styles as settingsStyles } from '../settings/styles';

type UpdateState = ReturnType<typeof useAppUpdate>;

function updateAction(update: UpdateState) {
  const { downloadState, updateCheck, checking } = update;
  if (downloadState.status === 'downloaded') return { label: '立即安装', onPress: update.installDownloaded };
  if (downloadState.status === 'downloading') return { label: '下载中', busy: true };
  if (checking) return { label: '检查中', busy: true };
  if (updateCheck?.updateAvailable) {
    return { label: '更新', onPress: () => update.beginDownload(updateCheck.release) };
  }
  if (update.error) return { label: '重试', onPress: () => void update.checkForUpdate() };
  return { label: updateCheck ? '已是最新' : '检查更新', current: Boolean(updateCheck),
    onPress: () => void update.checkForUpdate() };
}

export function VersionUpdateButton({ update }: { update: UpdateState }) {
  const action = updateAction(update);
  return <Pressable accessibilityRole="button" accessibilityLabel={action.label}
    accessibilityState={{ disabled: Boolean(action.busy), busy: Boolean(action.busy) }} disabled={Boolean(action.busy)}
    onPress={action.onPress} style={({ pressed }) => [styles.versionButton,
      action.current && styles.currentButton, pressed && settingsStyles.pressed]}>
    {action.busy ? <ActivityIndicator size="small" color="#079c70" />
      : <Ionicons name={action.current ? 'checkmark-circle-outline' : 'arrow-up-circle-outline'}
        size={16} color={action.current ? '#7d8496' : '#079c70'} />}
    <Text style={[styles.versionButtonText, action.current && styles.currentText]}>{action.label}</Text>
  </Pressable>;
}
