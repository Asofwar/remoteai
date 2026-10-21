import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../../theme/styles';
import { t, useLanguage } from '../../i18n';

export function GitActionDialog({ title, close, busy, children, confirm, label, disabled, danger }: {
  title: string; close: () => void; busy?: boolean; children: ReactNode; confirm?: () => void;
  label?: string; disabled?: boolean; danger?: boolean;
}) {
  const styles = useGitActionStyles();
  useLanguage();
  return <View style={styles.overlay} accessibilityViewIsModal>
    <Pressable style={StyleSheet.absoluteFill} accessible={false} disabled={busy} onPress={close} />
    <View style={styles.card}>
      <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.content}>{children}</ScrollView>
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.button}>
          <Text style={styles.label}>{t('取消')}</Text></Pressable>
        {confirm && <Pressable accessibilityRole="button" accessibilityLabel={label}
          accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
          onPress={confirm} style={[styles.button, (disabled || busy) && styles.disabled]}>
          {busy ? <ActivityIndicator /> : <Text style={[styles.label, danger && styles.danger]}>{label}</Text>}
        </Pressable>}
      </View>
    </View>
  </View>;
}

export const useGitActionStyles = createThemedStyles(color => ({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#0006',
    alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { width: '100%', maxWidth: 400, maxHeight: '100%', padding: 16, borderRadius: 16,
    backgroundColor: color('#fff', 'surface') },
  content: { flexShrink: 1 },
  title: { fontSize: 16, fontWeight: '700', color: color('#17211b', 'ink'), marginBottom: 12 },
  text: { fontSize: 13, lineHeight: 20, color: color('#17211b', 'ink'), marginBottom: 10 },
  hint: { fontSize: 12, lineHeight: 18, color: color('#708078', 'muted'), marginTop: 4 },
  item: { minHeight: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 8 },
  label: { fontSize: 14, lineHeight: 20, color: color('#0b8065', 'accent') },
  selected: { backgroundColor: color('#e4f4ef', 'elevated') },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingTop: 12 },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: .45 },
  danger: { color: color('#c84f47', 'danger') },
  input: { minHeight: 90, maxHeight: 150, borderWidth: 1, borderRadius: 8, padding: 10,
    borderColor: color('#d5dfd9', 'border'), color: color('#17211b', 'ink'), textAlignVertical: 'top' },
}));
