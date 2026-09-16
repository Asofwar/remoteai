import { useMemo, useState } from 'react';
import type { TokenSummary } from '../../../../shared/remote-chat/tokenSummary';
import { buildQuotaChartData, type QuotaInterval, type QuotaView }
  from '../../../desktop/src/components/TokenUsageDashboard/quotaHistoryData';
import { quotaChartLabels } from '../../../desktop/src/components/TokenUsageDashboard/quotaChartLabels';
import { formatTokens } from '../../../../shared/remote-chat/usage';

interface Point { label: string; values: Array<number | null> }
const COLORS = ['#14806f', '#a78bfa', '#f59e0b', '#4b96c7', '#e57f93'];

export function TokenBars({ points, labels, unit }: { points: Point[]; labels: string[]; unit?: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const maximum = Math.max(1, ...points.flatMap(point => point.values.map(value => value ?? 0)));
  const point = points[Math.min(selected ?? points.length - 1, points.length - 1)];
  return <div className="chat-token-chart">
    <div className="chat-token-bars" role="group" aria-label="选择日期查看消耗">{points.map((point, index) =>
      <button key={`${point.label}:${index}`} type="button" title={point.label} aria-label={point.label}
        aria-pressed={selected === index} onClick={() => setSelected(index)}>
        {point.values.map((value, position) => <span key={position} style={{
          height: value === null ? 0 : `${Math.max(value > 0 ? 1 : 0, value / maximum * 100)}%`,
          background: COLORS[position % COLORS.length],
        }} />)}</button>)}</div>
    <div className="chat-token-dates"><span>{points[0]?.label}</span><span>{points.at(-1)?.label}</span></div>
    {point && <div className="chat-token-legend"><strong>{point.label}</strong>{labels.map((label, index) =>
      <span key={label}><i style={{ background: COLORS[index % COLORS.length] }} />{label}：
        {point.values[index] == null ? '—' : unit ? `${point.values[index]!.toFixed(1)}${unit}`
          : formatTokens(point.values[index]!)}</span>)}</div>}
  </div>;
}

export function TokenQuota({ data }: { data: TokenSummary }) {
  const [accountId, setAccountId] = useState('');
  const [interval, setInterval] = useState<QuotaInterval>('sixHours');
  const [view, setView] = useState<QuotaView>('drop');
  const selected = data.quotaHistory.find(account => account.accountId === accountId) ?? data.quotaHistory[0];
  const labels = quotaChartLabels('zh');
  const chart = useMemo(() => buildQuotaChartData({ points: selected?.points ?? [],
    startTs: data.startTs, endTs: data.endTs, interval, view }), [selected, data.startTs, data.endTs, interval, view]);
  const primary = new Map(chart.primary);
  const secondary = new Map(chart.secondary);
  const points = [...new Set([...primary.keys(), ...secondary.keys()])].sort((a, b) => a - b).map(ts => ({
    label: new Date(ts).toLocaleString(), values: [primary.get(ts) ?? null, secondary.get(ts) ?? null],
  }));
  return <section className="chat-token-card"><h3>{labels.title}</h3>
    <div className="chat-token-controls"><select aria-label="选择额度账户" value={selected?.accountId ?? ''}
      onChange={event => setAccountId(event.target.value)}>{!selected && <option value="">{labels.noAccounts}</option>}
      {data.quotaHistory.map(account => <option key={account.accountId} value={account.accountId}>
        {account.accountLabel}</option>)}</select>
      <select aria-label="额度显示方式" value={view} onChange={event => setView(event.target.value as QuotaView)}>
        <option value="drop">时段下降</option><option value="remaining">剩余额度</option></select>
      <select aria-label="额度统计间隔" value={interval}
        onChange={event => setInterval(event.target.value as QuotaInterval)}>
        <option value="hour">每小时</option><option value="sixHours">每 6 小时</option><option value="day">每天</option>
      </select></div>
    {data.errors.quota ? <p className="chat-error">{labels.error}</p> : chart.hasData
      ? <TokenBars points={points} labels={[labels.primary, labels.secondary]} unit={view === 'drop' ? '百分点' : '%'} />
      : <p className="chat-muted">{labels.empty}</p>}
    <p className="chat-muted">{view === 'drop' ? labels.dropHint : '展示每次刷新的剩余额度；缺少记录的时段留空。'}</p>
    <p className="chat-muted">{labels.historyHint}</p>
  </section>;
}
