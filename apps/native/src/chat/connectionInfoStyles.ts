import { createThemedStyles } from '../theme/styles';
import { palette } from './styles';

export const useConnectionInfoStyles = createThemedStyles((color) => ({
  container: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  summary: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
  text: { color: color(palette.muted, 'muted'), fontSize: 11, lineHeight: 18 },
  name: { flexShrink: 1 },
  status: { flexShrink: 0, maxWidth: '55%' },
  // Actions wrap below the summary when the header is narrow; no truncating ancestor may hide them.
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, maxWidth: '100%' },
  action: { maxWidth: '100%', minHeight: 24, justifyContent: 'center' },
  actionText: { color: color(palette.green, 'accent'), fontSize: 11, lineHeight: 18 },
}));
