import { StyleSheet } from 'react-native';

export const deviceColors = {
  canvas: '#f3fbf8', ink: '#111522', muted: '#78818f', green: '#00866b',
  mint: '#e3f8f1', border: '#eaf0ed', danger: '#c64b43', offline: '#99a2ad',
};

// Keep Android font descenders and fallback glyphs inside the text view.
const textInsets = { includeFontPadding: true, paddingVertical: 2 };

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: deviceColors.canvas },
  scroll: { padding: 20, paddingTop: 22, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { ...textInsets, flex: 1, color: deviceColors.ink, fontSize: 30, lineHeight: 42, fontWeight: '800' },
  subtitle: { ...textInsets, color: deviceColors.muted, fontSize: 13, lineHeight: 20, marginTop: 5, marginBottom: 18 },
  refresh: {
    width: 44, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
    borderWidth: 1, borderColor: '#bfe9dc', backgroundColor: deviceColors.mint,
  },
  summary: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  stat: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 12, borderRadius: 16, backgroundColor: '#fff',
  },
  statIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: deviceColors.mint,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { ...textInsets, color: deviceColors.ink, fontSize: 28, lineHeight: 38, fontWeight: '800' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statLabel: { ...textInsets, flexShrink: 1, color: deviceColors.muted, fontSize: 12, lineHeight: 18 },
  listTitle: {
    ...textInsets, color: deviceColors.ink, fontSize: 17, lineHeight: 26, fontWeight: '700', marginBottom: 14,
  },
  listCount: { color: deviceColors.muted, fontWeight: '400' },
  card: {
    borderRadius: 18, backgroundColor: '#fff', padding: 14, marginBottom: 14,
    shadowColor: '#538f7c', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  pressed: { backgroundColor: '#edf9f4' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  platform: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#dcf6ed',
    alignItems: 'center', justifyContent: 'center',
  },
  identity: { flex: 1, minWidth: 0 },
  name: { ...textInsets, color: deviceColors.ink, fontSize: 16, lineHeight: 24, fontWeight: '800' },
  meta: { ...textInsets, color: deviceColors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10,
    paddingVertical: 7, borderRadius: 20, backgroundColor: deviceColors.mint,
  },
  badgeOffline: { backgroundColor: '#f0f2f4' },
  badgeText: { ...textInsets, color: deviceColors.green, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  muted: { color: deviceColors.muted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00aa7d' },
  dotOffline: { backgroundColor: deviceColors.offline },
  menuTrigger: {
    position: 'absolute', right: 6, top: 14, width: 36, height: 44,
    alignItems: 'center', justifyContent: 'center', borderRadius: 12,
  },
  topInset: { paddingRight: 28 },
  divider: { height: 1, backgroundColor: deviceColors.border, marginVertical: 12 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 29, paddingVertical: 3 },
  detailLabel: { ...textInsets, color: deviceColors.muted, fontSize: 12, lineHeight: 20, width: 72 },
  detailValue: {
    ...textInsets, flex: 1, minWidth: 0, color: deviceColors.ink, fontSize: 12, lineHeight: 20, textAlign: 'right',
  },
  hint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#e4f6ef', borderRadius: 14, padding: 15,
  },
  hintText: { ...textInsets, flexShrink: 1, color: deviceColors.muted, fontSize: 12, lineHeight: 19 },
  empty: { alignItems: 'center', padding: 32, borderRadius: 18, backgroundColor: '#fff', gap: 12 },
  emptyTitle: { ...textInsets, color: deviceColors.ink, fontSize: 17, lineHeight: 26, fontWeight: '700' },
  emptyText: { ...textInsets, color: deviceColors.muted, fontSize: 13, lineHeight: 21, textAlign: 'center' },
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#14251e55',
  },
  menu: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 16, backgroundColor: '#fff' },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  menuTitle: { ...textInsets, flex: 1, color: deviceColors.ink, fontSize: 18, lineHeight: 28, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, padding: 10, gap: 12, borderRadius: 12 },
  optionLabel: { ...textInsets, flex: 1, color: deviceColors.ink, fontSize: 16, lineHeight: 24 },
  danger: { color: deviceColors.danger },
  disabled: { opacity: 0.45 },
});
