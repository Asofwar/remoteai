import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatMarkdown } from './Markdown';
import { CopyTextButton } from './CopyTextButton';
import { toolOutputPage } from './toolOutput';
import { palette, styles } from './styles';

/** Match PC tool output paging while preserving the original payload for full-copy actions. */
export function ChatToolText({ text, markdown = false, prose = false }: {
  text: string; markdown?: boolean; prose?: boolean;
}) {
  const [requestedPage, setPage] = useState(0);
  const { page, pages, visible } = toolOutputPage(text, requestedPage);
  return <View style={toolStyles.content}>
    {markdown ? <ChatMarkdown text={visible} />
      : <Text selectable style={prose ? toolStyles.prose : styles.code}>{visible}</Text>}
    {pages > 1 && <View style={toolStyles.paging}>
      <Text style={styles.subtitle}>内容较长，分段显示</Text>
      <Pressable accessibilityRole="button" disabled={!page} onPress={() => setPage(page - 1)}>
        <Text style={[styles.subtitle, !page && styles.disabled]}>上一段</Text></Pressable>
      <Text style={styles.subtitle}>{page + 1} / {pages}</Text>
      <Pressable accessibilityRole="button" disabled={page === pages - 1} onPress={() => setPage(page + 1)}>
        <Text style={[styles.subtitle, page === pages - 1 && styles.disabled]}>下一段</Text></Pressable>
      <CopyTextButton text={text} label="复制完整内容" />
    </View>}
  </View>;
}

const toolStyles = StyleSheet.create({
  content: { gap: 8 },
  prose: { color: palette.ink, fontSize: 12, lineHeight: 20 },
  paging: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, maxWidth: 400 },
});
