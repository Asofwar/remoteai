import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { DiffFile } from '../../../../shared/chat/diff';
import { BottomSheet } from '../components/BottomSheet';
import { ChatDiffContent } from './ChatDiffContent';
import { palette, styles } from './styles';

const KINDS: Record<string, string> = { add: '新增', delete: '删除', update: '修改' };

export function DiffCounts({ added, removed }: { added: number; removed: number }) {
  return <View style={diffStyles.counts} accessibilityLabel={`新增 ${added} 行，删除 ${removed} 行`}>
    <Text style={diffStyles.added}>+{added}</Text><Text style={diffStyles.removed}>−{removed}</Text>
  </View>;
}

export function ChatDiff({ files }: { files: DiffFile[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Resolve from incoming props so an open drawer follows live edits.
  const selected = files.find((file, index) => `${file.path}:${index}` === selectedKey);
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  return <View style={diffStyles.document}>
    <View style={diffStyles.summary}>
      <Text style={styles.subtitle}>{new Set(files.map((file) => file.path)).size} 个文件</Text>
      <DiffCounts added={added} removed={removed} />
    </View>
    {files.map((file, index) => <Pressable key={`${file.path}:${index}`} accessibilityRole="button"
      accessibilityLabel={`查看 ${file.path} 的修改`} style={diffStyles.file}
      onPress={() => setSelectedKey(`${file.path}:${index}`)}>
      <Feather name="file-text" size={15} color={palette.muted} />
      <Text style={[styles.messageText, styles.fill]} numberOfLines={2}>{file.path.split(/[\\/]/).pop()}</Text>
      <Text style={styles.subtitle}>{file.previousPath ? '重命名' : KINDS[file.kind] ?? '修改'}</Text>
      <DiffCounts added={file.added} removed={file.removed} />
      <Feather name="chevron-right" size={15} color={palette.muted} />
    </Pressable>)}
    {selected && <BottomSheet visible tall title="文件差异" subtitle={selected.path}
      onClose={() => setSelectedKey(null)} onBack={() => setSelectedKey(null)} dragFromHeaderOnly>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        <ChatDiffContent key={selectedKey} file={selected} />
      </ScrollView>
    </BottomSheet>}
  </View>;
}

const diffStyles = StyleSheet.create({
  document: { gap: 8 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
    borderColor: palette.border, borderRadius: 8, padding: 10, minHeight: 44 },
  counts: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  added: { color: '#2e9863', fontSize: 12, lineHeight: 20 },
  removed: { color: '#c15a5a', fontSize: 12, lineHeight: 20 },
});
