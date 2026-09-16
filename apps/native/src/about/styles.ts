import { StyleSheet } from 'react-native';
import { settingsColors as colors } from '../settings/styles';

export const styles = StyleSheet.create({
  navigation: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 },
  back: { paddingHorizontal: 18, minHeight: 48, justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  icon: { width: 56, height: 56, borderRadius: 14 },
  versionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 14, marginTop: 4 },
  version: { color: colors.muted, fontSize: 14 },
  versionButton: {
    minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#e5fbf3',
  },
  versionButtonText: { color: '#079c70', fontSize: 13, fontWeight: '600' },
  currentButton: { backgroundColor: '#f3f5f6' },
  currentText: { color: colors.muted },
  description: { color: colors.muted, fontSize: 13, lineHeight: 21, paddingHorizontal: 22, paddingBottom: 22 },
  updateDetails: { paddingHorizontal: 22, paddingBottom: 18, gap: 16 },
  status: { gap: 8, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  statusHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusTitle: { color: colors.ink, fontSize: 15, fontWeight: '600', flex: 1 },
  statusLabel: { color: '#079c70', fontSize: 13 },
  detail: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  error: { color: colors.danger },
});
