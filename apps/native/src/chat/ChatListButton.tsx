import { Pressable, Text, View } from 'react-native';
import type { GuiAccountsClient } from '../../../../shared/remote-chat/guiAccounts';
import { guiAccountAvatar } from '../../../../shared/remote-chat/guiAccountAvatar';
import { useGuiAccounts } from '../../../../shared/remote-chat/client/useGuiAccounts';
import { t, useLanguage } from '../i18n';
import { createThemedStyles } from '../theme/styles';
import { palette } from './styles';

interface Props {
  client: GuiAccountsClient; active: boolean; ready: boolean; expanded: boolean; onPress: () => void;
}

export function ChatListButton({ client, active, ready, expanded, onPress }: Props) {
  useLanguage();
  const styles = useStyles();
  const { snapshot } = useGuiAccounts(client, active && ready);
  const avatar = guiAccountAvatar(snapshot, t('我'));
  return <Pressable accessibilityRole="button" accessibilityLabel={t('打开聊天列表')}
    accessibilityState={{ expanded }} onPress={onPress}
    style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
    <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.initials}>{avatar.initials}</Text>
    </View>
  </Pressable>;
}

const useStyles = createThemedStyles(color => ({
  button: { width: 44, height: 44, flexShrink: 0, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: color(palette.pale, 'accentSoft') },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#304e63',
    alignItems: 'center', justifyContent: 'center' },
  // Explicit leading and font padding leave room for Android's fallback glyphs.
  initials: { color: '#fff', fontSize: 14, lineHeight: 22, fontWeight: '500',
    includeFontPadding: true, textAlignVertical: 'center', textAlign: 'center' },
}));
