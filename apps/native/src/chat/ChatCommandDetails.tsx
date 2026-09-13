import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatTurnDuration } from '../../../desktop/src/pages/codexGui/turnTiming';
import { CopyTextButton } from './CopyTextButton';
import { palette, styles } from './styles';
import type { Item } from './types';

const OUTPUT_PAGE_CHARACTERS = 8_000;

function CommandText({ text, command = false }: { text: string; command?: boolean }) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(text.length / OUTPUT_PAGE_CHARACTERS));
  const page = Math.min(requestedPage, pages - 1);
  return <View>
    <ScrollView nestedScrollEnabled style={command ? commandStyles.command : commandStyles.output}>
      <Text selectable style={styles.code}>
        {text.slice(page * OUTPUT_PAGE_CHARACTERS, (page + 1) * OUTPUT_PAGE_CHARACTERS)}</Text>
    </ScrollView>
    {pages > 1 && <View style={commandStyles.paging}>
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

export function ChatCommandDetails({ item }: { item: Item }) {
  return <View style={{ gap: 8 }}>
    <View style={commandStyles.toolbar}>
      <Text selectable style={[styles.subtitle, styles.fill]}>{item.cwd}</Text>
      {item.durationMs != null && <Text style={styles.subtitle}>{formatTurnDuration(item.durationMs)}</Text>}
      <CopyTextButton text={item.command ?? ''} label="复制命令" />
    </View>
    <CommandText text={item.command ?? ''} command />
    <CommandText text={item.aggregatedOutput || (item.status === 'inProgress' ? '等待输出…' : '没有文本输出')} />
    <View style={commandStyles.toolbar}>
      <Text style={[styles.subtitle, styles.fill, item.exitCode !== 0 && commandStyles.failed]}>
        {item.exitCode != null ? `退出码：${item.exitCode}` : ''}</Text>
      <CopyTextButton text={item.aggregatedOutput ?? ''} label="复制输出" />
    </View>
  </View>;
}

const commandStyles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  command: { backgroundColor: '#f4f6f5', borderRadius: 5, paddingVertical: 8, paddingHorizontal: 10, maxHeight: 340 },
  output: { paddingVertical: 8, maxHeight: 340 },
  paging: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, maxWidth: 400 },
  failed: { color: palette.danger },
});
