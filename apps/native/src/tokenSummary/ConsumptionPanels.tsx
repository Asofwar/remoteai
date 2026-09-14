import { Text, View } from 'react-native';
import type { TokenSummary } from '../../../../shared/remote-chat/tokenSummary';
import { formatTokens } from '../../../desktop/src/components/TokenUsageDashboard/chartUtils';
import type { DailyTokenUsageBreakdown } from '../../../desktop/src/types/tokenUsageAnalytics';
import { TimeBars } from './TimeBars';
import { summaryStyles as s } from './styles';

type Field = Exclude<keyof DailyTokenUsageBreakdown, 'date'>;
const CONTEXT: Array<[string, Field]> = [
  ['短上下文', 'shortContextTokens'], ['长上下文', 'longContextTokens'], ['未识别', 'unknownContextTokens'],
];
const MODE: Array<[string, Field]> = [
  ['普通模式', 'standardModeTokens'], ['快速模式', 'fastModeTokens'], ['未识别', 'unknownModeTokens'],
];

function ConsumptionPanel({ data, title, fields, hint }: {
  data: TokenSummary; title: string; fields: Array<[string, Field]>; hint: string;
}) {
  const totals = fields.map(([, field]) => data.breakdown.reduce((sum, day) => sum + day[field], 0));
  const total = totals.reduce((sum, tokens) => sum + tokens, 0);
  const byDate = new Map(data.breakdown.map((day) => [day.date, day]));
  return <View style={s.card}><Text style={s.sectionTitle}>{title}</Text><Text style={s.hint}>{hint}</Text>
    {data.errors.analytics ? <Text style={s.error}>消耗统计加载失败，请刷新重试。</Text> : <>
      <View style={s.wrap}>{fields.map(([name], index) => <View key={name} style={s.metric}>
        <Text style={s.hint}>{name}</Text><Text style={s.value}>{formatTokens(totals[index], 'zh')}</Text>
        <Text style={s.hint}>{total ? `${(totals[index] / total * 100).toFixed(1)}%` : '—'}</Text>
      </View>)}</View>
      {total > 0 ? <TimeBars labels={fields.map(([name]) => name)} points={data.dateKeys.map((date) => ({
        label: date, values: fields.map(([, field]) => byDate.get(date)?.[field] ?? 0),
      }))} /> : <Text style={s.hint}>所选时段暂无 Token 消耗记录</Text>}
    </>}
  </View>;
}

export function ConsumptionPanels({ data }: { data: TokenSummary }) {
  return <>
    <ConsumptionPanel data={data} title="短 / 长上下文消耗" fields={CONTEXT}
      hint={`单次输入超过 ${data.thresholdTokens.toLocaleString()} Tokens（含缓存）计为长上下文，累计整次请求的消耗。`} />
    <ConsumptionPanel data={data} title="普通 / 快速模式消耗" fields={MODE}
      hint="按每日实际 Token 数统计；缺少模式记录的消耗归入“未识别”。" />
  </>;
}
