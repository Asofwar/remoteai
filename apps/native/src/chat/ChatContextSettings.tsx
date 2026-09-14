import { ActivityIndicator, Pressable, Text, TextInput } from 'react-native';
import { BottomSheet } from '../components/BottomSheet';
import { SheetScrollView } from '../components/SheetScrollView';
import type { ContextSettingsApi } from '../../../../shared/remote-chat/contextSettings';
import { useContextSettings } from '../../../../shared/remote-chat/client/useContextSettings';
import { styles } from './styles';

export function ChatContextSettings({ threadId, api, onClose }: {
  threadId: string; api: ContextSettingsApi; onClose: () => void;
}) {
  const editor = useContextSettings(threadId, api);
  const save = async () => { if (await editor.save()) onClose(); };
  return <BottomSheet visible fullWidthContent title="对话上下文设置" onClose={onClose}
    onBack={editor.saving ? undefined : onClose}
    dismissible={!editor.saving} actions={[
      { label: '取消', onPress: onClose, disabled: editor.saving },
      { label: '保存', tone: 'primary', onPress: save, loading: editor.saving,
        disabled: editor.loading || !editor.loaded },
    ]}>
    <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.settings}>
      <Text style={styles.subtitle}>仅用于当前对话，下次发送消息时生效，不会中断当前回复。</Text>
      {editor.loading && <ActivityIndicator accessibilityLabel="正在读取上下文设置" />}
      {editor.loaded && <>
        <Text style={styles.title}>上下文容量（K Token）</Text>
        <TextInput accessibilityLabel="上下文容量（K Token）" keyboardType="decimal-pad"
          value={editor.value} onChangeText={editor.setValue} editable={!editor.saving}
          placeholder="使用默认容量" style={[styles.input, styles.questionInput]}
          onSubmitEditing={() => { void save(); }} />
        <Text style={styles.subtitle}>1 K = 1000 Token；留空使用默认容量。</Text>
        <Text style={styles.subtitle}>用量会在收到回复后更新。程序会预留部分空间，显示的可用容量可能略小。</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="恢复默认" disabled={editor.saving}
          accessibilityState={{ disabled: editor.saving }} style={styles.button} onPress={() => editor.setValue('')}>
          <Text style={styles.buttonText}>恢复默认</Text>
        </Pressable>
      </>}
      {!!editor.error && <Text accessibilityRole="alert" style={styles.error}>{editor.error}</Text>}
      {!editor.loading && !editor.loaded && <Pressable accessibilityRole="button" accessibilityLabel="重试"
        style={styles.button} onPress={editor.retry}><Text style={styles.buttonText}>重试</Text></Pressable>}
    </SheetScrollView>
  </BottomSheet>;
}
