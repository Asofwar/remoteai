import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatTurnDuration } from '../../../desktop/src/pages/codexGui/turnTiming';
import { palette, styles } from './styles';
import type { Item } from './types';
import { SelectableChatText } from './SelectableChatText';

const OUTPUT_PAGE_CHARACTERS = 8_000;

function CommandText({ text, command = false, empty = '' }: { text: string; command?: boolean; empty?: string }) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(text.length / OUTPUT_PAGE_CHARACTERS));
  const page = Math.min(requestedPage, pages - 1);
  return <View>
    <ScrollView nestedScrollEnabled style={command ? commandStyles.command : commandStyles.output}
      contentContainerStyle={command ? commandStyles.commandContent : commandStyles.outputContent}>
      <SelectableChatText style={styles.code}
        copy={text ? { text, label: command ? '复制命令' : '复制输出' } : undefined}>
        {text.slice(page * OUTPUT_PAGE_CHARACTERS, (page + 1) * OUTPUT_PAGE_CHARACTERS).trimEnd() || empty}
      </SelectableChatText>
    </ScrollView>
    {pages > 1 && <View style={commandStyles.paging}>
      <Text style={styles.subtitle}>内容较长，分段显示</Text>
      <Pressable accessibilityRole="button" disabled={!page} onPress={() => setPage(page - 1)}>
        <Text style={[styles.subtitle, !page && styles.disabled]}>上一段</Text></Pressable>
      <Text style={styles.subtitle}>{page + 1} / {pages}</Text>
      <Pressable accessibilityRole="button" disabled={page === pages - 1} onPress={() => setPage(page + 1)}>
        <Text style={[styles.subtitle, page === pages - 1 && styles.disabled]}>下一段</Text></Pressable>
    </View>}
  </View>;
}

export function ChatCommandDetails({ item }: { item: Item }) {
  return <View style={{ gap: 8 }}>
    <View style={commandStyles.toolbar}>
      <Text selectable style={[styles.subtitle, styles.fill]}>{item.cwd}</Text>
      {item.durationMs != null && <Text style={styles.subtitle}>{formatTurnDuration(item.durationMs)}</Text>}
    </View>
    <CommandText text={item.command ?? ''} command />
    <CommandText text={item.aggregatedOutput ?? ''}
      empty={item.status === 'inProgress' ? '等待输出…' : '没有文本输出'} />
    <View style={commandStyles.toolbar}>
      <Text style={[styles.subtitle, styles.fill, item.exitCode !== 0 && commandStyles.failed]}>
        {item.exitCode != null ? `退出码：${item.exitCode}` : ''}</Text>
    </View>
  </View>;
}

const commandStyles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  command: { backgroundColor: '#f4f6f5', borderRadius: 5, maxHeight: 340 },
  commandContent: { paddingVertical: 8, paddingHorizontal: 10 },
  output: { maxHeight: 340 },
  outputContent: { paddingVertical: 8 },
  paging: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, maxWidth: 400 },
  failed: { color: palette.danger },
});
