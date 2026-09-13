import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CopyTextButton } from './CopyTextButton';
import { palette, styles } from './styles';
import { HighlightedCode } from './ChatCodeHighlight';

const PAGE_CHARS = 12_000;
interface Props { text: string; label?: string; language?: string; lineNumbers?: boolean; copyLabel?: string }

/** Limit native text layout work while keeping the entire output available to read and copy. */
export function ChatCodeBlock({ text, label = '代码', language = '', lineNumbers = false,
  copyLabel = '复制代码' }: Props) {
  const [limit, setLimit] = useState(PAGE_CHARS);
  const [wrap, setWrap] = useState(false);
  const visible = text.slice(0, limit);
  const displayed = lineNumbers
    ? visible.split('\n').map((line, index) => `${index + 1}  ${line}`).join('\n') : visible;
  const content = <Text selectable style={[styles.code, codeStyles.content]}>
    <HighlightedCode text={displayed || '（空文件）'} language={language} />
  </Text>;
  return <View style={codeStyles.block}>
    <View style={codeStyles.toolbar}>
      <Text style={[codeStyles.label, styles.fill]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="自动换行" accessibilityState={{ selected: wrap }}
        onPress={() => setWrap(!wrap)} style={codeStyles.action}>
        <Text style={[codeStyles.label, wrap && codeStyles.selected]}>自动换行</Text></Pressable>
      <CopyTextButton text={text} label={copyLabel} />
    </View>
    <ScrollView nestedScrollEnabled style={codeStyles.viewport}>
      {wrap ? content : <ScrollView horizontal nestedScrollEnabled>{content}</ScrollView>}
    </ScrollView>
    {text.length > limit && <Pressable accessibilityRole="button" style={styles.button}
      onPress={() => setLimit(limit + PAGE_CHARS)}><Text style={styles.buttonText}>显示更多内容</Text></Pressable>}
  </View>;
}

const codeStyles = StyleSheet.create({
  block: { backgroundColor: '#f4f6f5', borderRadius: 10, borderWidth: 1,
    borderColor: palette.border, overflow: 'hidden', marginVertical: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: palette.border },
  label: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  action: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  selected: { color: palette.green },
  viewport: { maxHeight: 600 },
  content: { padding: 16 },
});
