import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { MAX_SUMMARY_WEEKS, MIN_SUMMARY_WEEKS, type ReadTokenSummary } from
  '../../../../shared/remote-chat/tokenSummary';
import { useTokenSummary } from '../../../../shared/remote-chat/client/useTokenSummary';
import { UsageTotals, UsageTrend, RankingPanel } from './UsagePanels';
import { ConsumptionPanels } from './ConsumptionPanels';
import { UsageHeatmap } from './UsageHeatmap';
import { QuotaPanel } from './QuotaPanel';
import { summaryStyles as s } from './styles';

interface Props { read: ReadTokenSummary; ready: boolean; foreground: boolean; deviceName?: string; onBack: () => void }

export function TokenSummaryPage({ read, ready, foreground, deviceName, onBack }: Props) {
  const summary = useTokenSummary({ read, active: ready && foreground });
  const { data, loading, error } = summary;
  const [draftWeeks, setDraftWeeks] = useState('');
  useEffect(() => { setDraftWeeks(summary.weeks?.toString() ?? ''); }, [summary.weeks]);
  const applyWeeks = () => {
    const value = Number(draftWeeks);
    if (!Number.isInteger(value) || value < MIN_SUMMARY_WEEKS || value > MAX_SUMMARY_WEEKS) {
      setDraftWeeks(summary.weeks?.toString() ?? ''); return;
    }
    if (value !== summary.weeks) summary.changeWeeks(value);
  };
  return <View style={s.page}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回聊天" style={s.button} onPress={onBack}>
        <Feather name="arrow-left" size={24} color="#17211b" />
      </Pressable><Text accessibilityRole="header" style={[s.title, s.fill]}>Token 汇总</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="刷新 Token 汇总" style={s.button}
        disabled={!ready || loading} onPress={summary.refresh}>
        {loading ? <ActivityIndicator color="#0b8065" /> : <Feather name="refresh-cw" size={20} color="#0b8065" />}
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={summary.refresh} enabled={ready}
        tintColor="#0b8065" colors={['#0b8065']} />}>
      <View style={{ gap: 8 }}><Text style={s.hint}>{deviceName || '尚未选择电脑'} · 仅统计代理模式的 Token 消耗</Text>
        <View style={s.row}><Text style={s.hint}>最近</Text>
          <TextInput accessibilityLabel="统计周数，1 至 52 周" style={s.input} value={draftWeeks}
            keyboardType="number-pad" maxLength={2} onChangeText={setDraftWeeks}
            onEndEditing={applyWeeks} onSubmitEditing={applyWeeks} returnKeyType="done" />
          <Text style={[s.hint, s.fill]}>周</Text>
          <Pressable accessibilityRole="button" style={s.button} onPress={applyWeeks}>
            <Text style={s.action}>应用</Text></Pressable>
        </View>
        {data && <Text style={s.hint}>更新于 {new Date(data.endTs * 1000).toLocaleTimeString()}</Text>}
      </View>
      {!ready && <Text style={s.error}>连接电脑后即可查看 Token 汇总。</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {loading && !data && <Text style={s.hint}>正在加载汇总…</Text>}
      {data && <>
        <UsageTotals data={data} />
        <QuotaPanel data={data} />
        <ConsumptionPanels data={data} />
        <UsageHeatmap data={data} />
        <UsageTrend data={data} />
        <RankingPanel title="Provider 消耗排行" ranking={data.rankings.providers} count={data.entryCount} />
        <RankingPanel title="模型消耗排行" ranking={data.rankings.models} count={data.entryCount} />
        <RankingPanel title="账户消耗排行" ranking={data.rankings.accounts} count={data.entryCount} />
      </>}
    </ScrollView>
  </View>;
}
