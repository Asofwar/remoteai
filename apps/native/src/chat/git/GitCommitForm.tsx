import { Pressable, Text, TextInput, View } from 'react-native';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t, useLanguage } from '../../i18n';
import { useThemeColor } from '../../theme/store';
import { palette } from '../styles';
import { useGitStyles } from './styles';
import { GitSelectionMark } from './GitTreeIcon';

export function GitCommitForm({ panel }: { panel: RemoteGit }) {
  const styles = useGitStyles();
  const color = useThemeColor();
  useLanguage();
  return <View style={styles.form}>
    <TextInput accessibilityLabel={t('提交说明')} multiline maxLength={4000} value={panel.message}
      placeholder={t(panel.autoMessage ? '提交时根据所选文件自动生成说明' : '填写提交说明，或点 AI 生成')}
      placeholderTextColor={color(palette.muted, 'muted')} editable={!panel.busy && !panel.autoMessage}
      style={[styles.input, (panel.busy || panel.autoMessage) && styles.inputDisabled]}
      onChangeText={panel.setMessage} onKeyPress={event => {
        if (event.nativeEvent.key !== 'Tab' || panel.message.trim() || !panel.canGenerateMessage) return;
        event.preventDefault(); void panel.generateMessage();
      }} />
    <View style={styles.messageOptions}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={t('自动生成提交说明')}
        accessibilityState={{ checked: panel.autoMessage, disabled: panel.busy || panel.settingsBusy }}
        disabled={panel.busy || panel.settingsBusy}
        style={styles.checkButton} onPress={() => void panel.setAutoMessage(!panel.autoMessage)}>
        <GitSelectionMark checked={panel.autoMessage} /><Text style={styles.hint}>{t('自动生成提交说明')}</Text>
      </Pressable>
      {!panel.autoMessage && !panel.message.trim() && <Pressable accessibilityRole="button"
        disabled={!panel.canGenerateMessage} style={[styles.button, !panel.canGenerateMessage && styles.disabled]}
        onPress={() => void panel.generateMessage()}><Text style={styles.buttonText}>{t('AI 生成')}</Text></Pressable>}
    </View>
    {panel.generatingMessage && <Text accessibilityLiveRegion="polite" style={styles.hint}>
      {t('正在生成提交说明…')}</Text>}
    <View style={styles.commitActions}>
      <Pressable accessibilityRole="button" disabled={!panel.canCommit}
        style={[styles.submit, styles.fill, !panel.canCommit && styles.disabled]} onPress={() => void panel.commit()}>
        <Text style={styles.submitText}>{t('提交 {count} 个文件', { count: Object.keys(panel.selected).length })}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!panel.canCommitAndPush}
        style={[styles.submit, styles.fill, !panel.canCommitAndPush && styles.disabled]}
        onPress={() => void panel.commit({ push: true })}><Text style={styles.submitText}>{t('提交并推送')}</Text>
      </Pressable>
    </View>
  </View>;
}
