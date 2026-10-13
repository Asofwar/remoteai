import Feather from '@expo/vector-icons/Feather';
import { FlatList, Pressable, Text, View } from 'react-native';
import { t, useLanguage } from '../i18n';
import { createThemedStyles } from '../theme/styles';
import { useThemeColor } from '../theme/store';
import { projectFileReference, useProjectFileCandidates,
  type ProjectFileSearch } from '../../../../shared/chat/useProjectFileCandidates';
import type { AttachmentReference } from '../../../desktop/src/pages/codexGui/attachmentTypes';

export function ComposerFileMenu(props: {
  query: string; threadId: string | null; cwd: string; ready: boolean; load: ProjectFileSearch;
  choose: (reference: AttachmentReference) => void; close: () => void;
}) {
  useLanguage();
  const styles = useStyles();
  const color = useThemeColor();
  const { query, threadId, cwd, ready, load, choose, close } = props;
  const result = useProjectFileCandidates({ active: true, connected: ready, query, threadId, cwd, load });
  return <View accessibilityLabel={t('引用文件或文件夹')} style={styles.root}>
    <View style={styles.heading}>
      <Text style={styles.detail}>{t('引用文件或文件夹')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('关闭文件列表')} onPress={close} hitSlop={8}>
        <Feather name="x" size={18} color={color('#777', 'muted')} />
      </Pressable>
    </View>
    <FlatList data={result.entries} keyExtractor={file => file.path} style={styles.list}
      keyboardShouldPersistTaps="always" nestedScrollEnabled
      renderItem={({ item }) => <Pressable accessibilityRole="menuitem" disabled={!ready}
        onPress={() => choose(projectFileReference(item))}
        style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
        <Feather name={item.directory ? 'folder' : 'file'} size={18} color={color('#777', 'muted')} />
        <View style={styles.text}><Text style={styles.title}>{item.name}</Text>
          <Text style={styles.detail}>{item.relativePath ?? item.path}</Text></View>
      </Pressable>}
      ListFooterComponent={<>
        {result.loading && <Text style={styles.message}>{t('正在搜索文件…')}</Text>}
        {!!result.error && <Text accessibilityRole="alert" style={styles.message}>{t(result.error)}</Text>}
        {!result.loading && !result.error && !result.entries.length
          && <Text style={styles.message}>{t('没有找到匹配的文件或文件夹')}</Text>}
        {result.truncated && <Text style={styles.message}>{t('仅显示部分结果，请输入更完整的名称或路径')}</Text>}
      </>} />
  </View>;
}

const useStyles = createThemedStyles(color => ({
  root: { flexShrink: 1, maxWidth: 400 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  list: { maxHeight: 250, flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 12 },
  text: { flex: 1 },
  title: { color: color('#161616', 'ink'), fontSize: 14, lineHeight: 21 },
  detail: { color: color('#777', 'muted'), fontSize: 12, lineHeight: 18 },
  message: { color: color('#777', 'muted'), fontSize: 12, lineHeight: 18, margin: 12 },
  pressed: { backgroundColor: color('#f2f2f2', 'elevated') },
}));
