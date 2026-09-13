import { ScrollView, StyleSheet, Text } from 'react-native';
import { BottomSheet } from '../components/BottomSheet';
import type { Item } from './types';
import { styles } from './styles';
import { messageLabel } from '../../../../shared/chat/messageDetails';
import { ChatToolContent } from './ChatToolContent';

export function ChatToolDetails({ item, onClose, onBack }: {
  item: Item; onClose: () => void; onBack?: () => void;
}) {
  return <BottomSheet visible tall title={messageLabel(item)} onClose={onClose} onBack={onBack} dragFromHeaderOnly>
    <ScrollView style={sheetStyles.scroll} contentContainerStyle={sheetStyles.content}
      showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
      {item.status === 'inProgress' && <Text style={styles.subtitle}>进行中…</Text>}
      <ChatToolContent item={item} />
    </ScrollView>
  </BottomSheet>;
}

const sheetStyles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center', paddingBottom: 20, gap: 16 },
});
