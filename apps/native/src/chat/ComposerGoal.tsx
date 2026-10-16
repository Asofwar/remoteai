import { createThemedStyles } from '../theme/styles';
import { useThemeColor } from '../theme/store';
import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { GOAL_STATUS, type ThreadGoal } from '../../../desktop/src/pages/codexGui/goalTypes';
import { BottomSheet } from '../components/BottomSheet';
import { SheetScrollView } from '../components/SheetScrollView';
import { palette } from './styles';

interface Props {
  goal?: ThreadGoal | null;
  draft: string;
  disabled: boolean;
  remove: () => void;
}

export function ComposerGoal({ goal, draft, disabled, remove }: Props) {
  const styles = useStyles();
  const color = useThemeColor();
  const [open, setOpen] = useState(false);
  useLanguage();
  const objective = goal?.objective ?? draft.trim();
  const title = t(goal ? '目标详情' : '目标模式');
  return <>
    <View style={styles.chip}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('查看目标')}
        accessibilityState={{ expanded: open }} style={styles.preview}
        onPress={() => { Keyboard.dismiss(); setOpen(true); }}>
        <Feather name="target" size={16} color={color(palette.green, 'accent')} />
        <View style={styles.content}>
          <Text style={styles.label}>{t(goal ? '目标' : '目标模式')}</Text>
          {!!goal && <Text style={styles.text}>{goal.objective}</Text>}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('移除目标')} disabled={disabled}
        accessibilityState={{ disabled }} onPress={remove}
        style={[styles.remove, disabled && { opacity: 0.4 }]}>
        <Feather name="x" size={16} color={color(palette.ink, 'ink')} />
      </Pressable>
    </View>
    {open && <BottomSheet visible title={title} maxWidth={400} dragFromHeaderOnly
      onClose={() => setOpen(false)}>
      <SheetScrollView contentContainerStyle={styles.details}>
        {goal && <Text style={styles.label}>{t(GOAL_STATUS[goal.status])}</Text>}
        <Text selectable style={styles.objective}>{objective || t('描述想完成的目标…')}</Text>
        {!goal && <Text style={styles.help}>
          {t('描述想完成的结果。Codex 会持续推进，直到完成目标或需要你的协助。')}
        </Text>}
      </SheetScrollView>
    </BottomSheet>}
  </>;
}

const useStyles = createThemedStyles((color) => ({
  chip: { flexDirection: 'row', alignItems: 'flex-start', width: '100%',
    borderWidth: 1, borderColor: color(palette.border, 'border'), borderRadius: 14,
    backgroundColor: color('#f5f5f5', 'canvas') },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
    minHeight: 44, paddingHorizontal: 10, paddingVertical: 8 },
  content: { flex: 1, minWidth: 0, gap: 2 },
  label: { color: color(palette.green, 'accent'), fontSize: 12, lineHeight: 20, includeFontPadding: true },
  text: { color: color(palette.ink, 'ink'), fontSize: 13, lineHeight: 21, includeFontPadding: true },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  details: { gap: 12, paddingHorizontal: 0, paddingBottom: 20 },
  objective: { color: color(palette.ink, 'ink'), fontSize: 15, lineHeight: 24, includeFontPadding: true },
  help: { color: color(palette.muted, 'muted'), fontSize: 13, lineHeight: 21 },
}));
