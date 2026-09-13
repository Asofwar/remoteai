import { StyleSheet } from 'react-native';
import { palette } from '../chat/styles';

export const chartColors = ['#0b8065', '#cb8b41', '#7d8eaa', '#304e63', '#87b8a4'];
export const summaryStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: palette.border },
  title: { color: palette.ink, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: palette.border,
    padding: 16, gap: 12 },
  sectionTitle: { color: palette.ink, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  hint: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fill: { flex: 1, minWidth: 0 },
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 12, borderRadius: 10 },
  chip: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center',
    borderRadius: 10, backgroundColor: palette.background },
  selected: { backgroundColor: palette.pale },
  action: { color: palette.green, fontSize: 14, lineHeight: 22, fontWeight: '600' },
  value: { color: palette.ink, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  number: { color: palette.green, fontSize: 30, lineHeight: 40, fontWeight: '700' },
  metric: { minWidth: '40%', flexGrow: 1, gap: 4 },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: palette.background, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4, backgroundColor: palette.green },
  error: { color: palette.danger, fontSize: 13, lineHeight: 20, maxWidth: 400 },
  detail: { padding: 12, borderRadius: 10, backgroundColor: palette.background, gap: 4, maxWidth: 400 },
  input: { minHeight: 44, minWidth: 48, textAlign: 'center', borderRadius: 8,
    borderWidth: 1, borderColor: palette.border, color: palette.ink, fontSize: 16 },
});
