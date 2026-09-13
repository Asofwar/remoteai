import { StyleSheet, Text, View } from 'react-native';
import { useChatUsage } from '../../../../shared/remote-chat/client/useChatUsage';
import { formatCost, formatTokens, usageTrailing, type ReadUsage } from '../../../../shared/remote-chat/usage';
import { palette } from './styles';
import { contextUsageLabel } from '../../../../shared/remote-chat/contextUsage';
import type { ThreadTokenUsage } from './types';

export function ChatUsage({ read, active, ready, tokenUsage }: {
  read: ReadUsage; active: boolean; ready: boolean; tokenUsage?: ThreadTokenUsage;
}) {
  const { usage, error } = useChatUsage(read, active && ready);
  const trailing = usageTrailing(usage);
  const notice = ready ? error || '正在读取今日用量…' : '连接后查看今日用量';
  return <View style={styles.container}>
    <Text style={styles.row}>{contextUsageLabel(tokenUsage)}</Text>
    {usage ? <Text style={styles.row} accessibilityLabel={[
      `今日 Token 用量：${usage.totalTokens.toLocaleString('en-US')}`,
      `今日预估费用：${formatCost(usage.estimatedCostUsd)}`, trailing?.description,
    ].filter(Boolean).join('，')}>
      今日 <Text style={styles.tokens}>{formatTokens(usage.totalTokens)} Token</Text>
      {' · 预估 '}<Text style={styles.cost}>{formatCost(usage.estimatedCostUsd)}</Text>
      {trailing && <Text>{' · '}{trailing.label}
        <Text style={styles[trailing.tone]}>{trailing.text}</Text></Text>}
    </Text> : <Text style={styles.row}>{notice}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 14, gap: 4 },
  row: { color: palette.muted, fontSize: 12, lineHeight: 20, flexShrink: 1 },
  tokens: { color: palette.green, fontWeight: '600' },
  cost: { color: '#b45d00', fontWeight: '600' },
  quota: { color: '#16874e', fontWeight: '600' },
  low: { color: palette.danger, fontWeight: '600' },
});
