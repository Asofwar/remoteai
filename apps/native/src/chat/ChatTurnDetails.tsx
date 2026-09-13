import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../components/BottomSheet';
import { ChatMarkdown } from './Markdown';
import { ChatDiff } from './ChatDiff';
import { CopyTextButton } from './CopyTextButton';
import { completedTurnFiles } from './turnPresentation';
import { turnErrorNotice, type TurnPanel } from './ChatTurnSummary';
import { requestErrorDetails } from '../../../desktop/src/pages/codexGui/requestError';
import { palette, styles } from './styles';
import type { Turn } from './types';

interface Props { turn: Turn; panel: TurnPanel; onClose: () => void }
const PANEL_TITLES: Record<TurnPanel, string> = { plan: '任务计划', changes: '本轮修改', error: '报错详情' };

function PlanDetails({ turn }: { turn: Turn }) {
  return <View style={detailStyles.plan}>
    {!!turn.planExplanation && <ChatMarkdown text={turn.planExplanation} />}
    {turn.plan?.map((step, index) => {
      const completed = step.status === 'completed';
      const running = step.status === 'inProgress';
      return <View key={index} style={detailStyles.step}>
        <Ionicons name={completed ? 'checkmark-circle-outline' : running ? 'sync-outline' : 'ellipse-outline'}
          size={15} color={completed ? palette.green : palette.muted} />
        <Text style={[styles.messageText, styles.fill, running && detailStyles.activeStep]}>{step.step}</Text>
        <Text style={styles.subtitle}>{completed ? '已完成' : running ? '进行中' : '待开始'}</Text>
      </View>;
    })}
  </View>;
}

function ErrorDetails({ turn }: { turn: Turn }) {
  const error = turn.error ?? turn.retryError;
  const text = error ? requestErrorDetails(error) : turnErrorNotice(turn);
  return <View style={detailStyles.error}>
    <Text selectable style={styles.messageText}>{text}</Text>
    <CopyTextButton text={text} label="复制报错详情" />
  </View>;
}

export function ChatTurnDetails({ turn, panel, onClose }: Props) {
  return <BottomSheet visible tall title={PANEL_TITLES[panel]} onClose={onClose} dragFromHeaderOnly>
    <ScrollView style={detailStyles.scroll} contentContainerStyle={detailStyles.content}>
      {panel === 'plan' && <PlanDetails turn={turn} />}
      {panel === 'changes' && <ChatDiff files={completedTurnFiles(turn)} />}
      {panel === 'error' && <ErrorDetails turn={turn} />}
    </ScrollView>
  </BottomSheet>;
}

const detailStyles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  content: { paddingBottom: 20 },
  plan: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  activeStep: { fontWeight: '600' },
  error: { gap: 12, maxWidth: 400 },
});
