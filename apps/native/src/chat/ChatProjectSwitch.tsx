import Feather from '@expo/vector-icons/Feather';
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { t, useLanguage } from '../i18n';
import { createThemedStyles } from '../theme/styles';
import { useThemeColor } from '../theme/store';
import { BottomSheet } from '../components/BottomSheet';
import { SheetFlatList, SheetInset, SHEET_READABLE_WIDTH } from '../components/SheetScrollView';
import { useProjectSwitch, type ProjectSwitchProps } from '../../../../shared/remote-chat/client/useProjectSwitch';
import { ChatProjectPicker } from './ChatProjectPicker';

export function ChatProjectSwitch(props: ProjectSwitchProps) {
  useLanguage();
  const styles = useStyles();
  const color = useThemeColor();
  const picker = useProjectSwitch(props);
  return <View style={styles.bar}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('选择项目')} disabled={picker.disabled}
      accessibilityState={{ disabled: picker.disabled, expanded: !!picker.screen }}
      style={[styles.trigger, picker.disabled && styles.disabled]}
      onPress={() => { Keyboard.dismiss(); picker.open(); }}>
      <Feather name="folder" size={16} color={color('#6f8177', 'muted')} />
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.label}>{picker.label || t('未选择项目')}</Text>
      <Feather name="chevron-down" size={14} color={color('#6f8177', 'muted')} />
    </Pressable>
    {picker.screen === 'projects' && !picker.disabled && <BottomSheet visible fullWidthContent
      title={t('选择项目')} onClose={picker.close} dragFromHeaderOnly
      actions={[{ label: t('新建项目'), tone: 'primary', onPress: picker.create }]}>
      <SheetInset style={styles.readable}>
        {picker.loading && <ActivityIndicator accessibilityLabel={t('正在加载…')} />}
        {!!picker.error && <View><Text accessibilityRole="alert" style={styles.message}>{t(picker.error)}</Text>
          <Pressable accessibilityRole="button" onPress={picker.retry}><Text style={styles.message}>{t('重试')}</Text>
          </Pressable></View>}
      </SheetInset>
      <SheetFlatList data={picker.projects} keyExtractor={project => project.cwd} style={styles.list}
        contentContainerStyle={styles.readable} keyboardShouldPersistTaps="handled" nestedScrollEnabled
        ListEmptyComponent={!picker.loading && !picker.error
          ? <Text style={styles.message}>{t('还没有项目')}</Text> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={item.label}
          accessibilityState={{ selected: item.cwd === picker.cwd }} onPress={() => picker.choose(item)}
          style={[styles.option, item.cwd === picker.cwd && styles.selected]}>
          <Feather name="folder" size={18} color={color('#6f8177', 'muted')} />
          <View style={styles.details}><Text style={styles.name}>{item.label}</Text>
            <Text style={styles.path}>{item.cwd}</Text></View>
          {item.cwd === picker.cwd && <Feather name="check" size={18} color={color('#14806f', 'accent')} />}
        </Pressable>} />
    </BottomSheet>}
    {picker.screen === 'create' && !picker.disabled && <ChatProjectPicker cwd={picker.cwd}
      title={t('新建项目')} load={props.controller.loadProjectDirectories} close={picker.close} choose={picker.choose} />}
  </View>;
}

const useStyles = createThemedStyles(color => ({
  bar: { maxWidth: 400, marginHorizontal: 8, marginBottom: 6 },
  trigger: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7,
    maxWidth: '100%', minHeight: 36, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 },
  label: { flexShrink: 1, color: color('#6f8177', 'muted'), fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.5 },
  readable: { width: '100%', maxWidth: SHEET_READABLE_WIDTH, alignSelf: 'center' },
  list: { maxHeight: 340, flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, padding: 10, borderRadius: 10 },
  selected: { backgroundColor: color('#e6f8f1', 'canvas') },
  details: { flex: 1, minWidth: 0 },
  name: { color: color('#13231c', 'ink'), fontSize: 14, lineHeight: 22 },
  path: { color: color('#6f8177', 'muted'), fontSize: 12, lineHeight: 18, marginTop: 4 },
  message: { color: color('#6f8177', 'muted'), fontSize: 13, lineHeight: 20, padding: 12 },
}));
