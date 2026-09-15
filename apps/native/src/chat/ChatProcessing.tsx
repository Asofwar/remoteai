import { ActivityIndicator, Text, View } from 'react-native';
import { styles } from './styles';
import { useProcessingStatus, type ChatProcessingProps } from '../../../../shared/remote-chat/client/useProcessingStatus';

export function ChatProcessing(props: ChatProcessingProps) {
  const { label } = useProcessingStatus(props);
  return <View style={styles.historyStatus}>
    <ActivityIndicator size="small" />
    <Text style={[styles.status, { flexShrink: 1, maxWidth: 400 }]}>{label}</Text>
  </View>;
}
