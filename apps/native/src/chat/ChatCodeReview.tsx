import { useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReviewComment } from '../../../desktop/src/pages/codexGui/messageDirectives';
import { ChatFileContext } from './ChatFilePreview';
import { reviewLocation } from './markdownContent';
import { palette, styles } from './styles';

export function ChatCodeReview({ comment }: { comment: ReviewComment }) {
  const openFile = useContext(ChatFileContext);
  const { label, reference } = reviewLocation(comment);
  const open = reference && openFile ? () => openFile(reference) : undefined;
  return <View style={reviewStyles.comment} accessibilityLabel="代码审查意见">
    <View style={reviewStyles.title}>
      <MaterialCommunityIcons name="file-search-outline" size={16} color="#b07824" />
      <Text selectable style={[reviewStyles.text, reviewStyles.titleText, styles.fill]}>{comment.title}</Text>
    </View>
    <Text selectable style={[reviewStyles.text, reviewStyles.body]}>{comment.body}</Text>
    <Text selectable={!open} accessibilityRole={open ? 'link' : undefined} onPress={open}
      style={[reviewStyles.text, open && reviewStyles.link]}>{label}</Text>
  </View>;
}

const reviewStyles = StyleSheet.create({
  comment: { borderWidth: 1, borderTopColor: palette.border, borderRightColor: palette.border,
    borderBottomColor: palette.border, borderLeftWidth: 3, borderLeftColor: '#d39335',
    borderRadius: 8, paddingVertical: 12, paddingHorizontal: 15, marginVertical: 12 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { fontWeight: '700' },
  text: { color: palette.ink, fontSize: 13, lineHeight: 22 },
  body: { marginVertical: 10 },
  link: { color: '#1677ff' },
});
