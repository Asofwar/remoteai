import { StyleSheet } from 'react-native';

export const settingsColors = {
  ink: '#101425', muted: '#7d8496', border: '#eef0f3', canvas: '#f5f6f8',
  green: '#00c98b', blue: '#008cff', orange: '#ff9900', danger: '#f0182c',
};

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: settingsColors.canvas },
  scroll: { flexGrow: 1 },
  header: { backgroundColor: '#fff', paddingHorizontal: 22, paddingTop: 14, paddingBottom: 18 },
  title: { color: settingsColors.ink, fontSize: 27, fontWeight: '700' },
  group: { backgroundColor: '#fff', marginBottom: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 24, gap: 18 },
  avatar: {
    width: 56, height: 56, borderRadius: 12, backgroundColor: '#c6f8ef',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCenter: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#9df0df',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#00392f', fontSize: 18, fontWeight: '600' },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { color: settingsColors.ink, fontSize: 19, fontWeight: '700' },
  caption: { color: settingsColors.muted, fontSize: 14, marginTop: 5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 22, gap: 15, minHeight: 56 },
  icon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowContent: {
    flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingRight: 22, paddingVertical: 14,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: settingsColors.border },
  profileDivider: { height: StyleSheet.hairlineWidth, backgroundColor: settingsColors.border, marginLeft: 96 },
  label: { color: settingsColors.ink, fontSize: 16, flexShrink: 0 },
  value: { color: settingsColors.muted, fontSize: 15, flex: 1, minWidth: 0, textAlign: 'right' },
  spacer: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.6 },
  footer: {
    marginTop: 'auto', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 24,
    backgroundColor: '#fafafb', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: settingsColors.border,
  },
  logout: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#ffd4db', backgroundColor: '#fff2f4', padding: 10,
  },
  logoutText: { color: settingsColors.danger, fontSize: 17, fontWeight: '600' },
  sheetBody: { width: '100%', maxWidth: 400, alignSelf: 'center', gap: 12, paddingVertical: 8 },
  hint: { color: settingsColors.muted, fontSize: 14, lineHeight: 21 },
  error: { color: settingsColors.danger, fontSize: 14, lineHeight: 21 },
  detailLabel: { color: settingsColors.ink, fontSize: 15, fontWeight: '600' },
  detailValue: { color: settingsColors.muted, fontSize: 15, lineHeight: 23 },
  input: {
    minHeight: 48, borderWidth: 1, borderColor: '#dce2e6', borderRadius: 10,
    paddingHorizontal: 14, color: settingsColors.ink, fontSize: 16, backgroundColor: '#fafbfc',
  },
});
