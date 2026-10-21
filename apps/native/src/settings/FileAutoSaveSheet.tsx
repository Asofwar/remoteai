import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AUTO_SAVE_OPTIONS } from '../../../../shared/project-browser/preferences';
import { BottomSheet } from '../components/BottomSheet';
import { t } from '../i18n';
import { setFileAutoSave, useFilePreferences } from './filePreferences';
import { useStyles } from './styles';

export function FileAutoSaveSheet({ onClose }: { onClose: () => void }) {
  const preferences = useFilePreferences();
  const styles = useStyles();
  const [error, setError] = useState(false);
  return <BottomSheet visible title={t('文件自动保存')} onClose={onClose} maxWidth={400}>
    <View style={styles.sheetBody} accessibilityRole="radiogroup">
      <Text style={styles.hint}>{t('停止输入后自动保存。关闭后，可点击保存或按 Ctrl+S（Mac：⌘S）。')}</Text>
      {AUTO_SAVE_OPTIONS.map(option => <Pressable key={option.value} accessibilityRole="radio"
        accessibilityLabel={t(option.label)} accessibilityState={{ checked: preferences.delay === option.value }}
        style={styles.themeOption} onPress={() => {
          void setFileAutoSave(option.value).then(saved => { if (saved) onClose(); else setError(true); });
        }}>
        <Text style={styles.detailLabel}>{t(option.label)}</Text><View style={styles.spacer} />
        {preferences.delay === option.value && <Text style={styles.detailLabel}>✓</Text>}
      </Pressable>)}
      {error && <Text accessibilityRole="alert" style={styles.error}>{t('未能保存设置，请重试。')}</Text>}
    </View>
  </BottomSheet>;
}
