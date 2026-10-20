// Isolated Android entry point: uses real chat rendering without an account, network or model.
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { ChatMessages } from '../src/chat/ChatMessages';
import { ChatProcessing } from '../src/chat/ChatProcessing';
import type { Item, Thread } from '../src/chat/types';
import { historyLoadResult, type HistoryLoadResult } from '../../../shared/remote-chat/client/historyLoad';

const STREAM_STEPS = 160;
const STREAM_INTERVAL_MS = 100;
const HISTORY_DELAY_MS = 500;
const LINE = '正在检查富文本、代码高亮、工具详情、目录分组和文件预览，继续验证实时输出时的聊天位置。';
const DIFF = Array.from({ length: 55 }, (_, index) => [
  `diff --git a/src/file-${index}.ts b/src/file-${index}.ts`,
  `--- a/src/file-${index}.ts`, `+++ b/src/file-${index}.ts`, '@@ -1 +1 @@', '-before', '+after',
].join('\n')).join('\n');
type Mode = 'long' | 'short' | 'plain' | 'progress' | 'history' | 'collapsed';

function history(count: number, prefix: string): Item[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`,
    type: 'commandExecution', status: 'completed', command: `echo ${prefix} ${index}` }));
}

function fixtureItems(mode: Mode, pages: number): Item[] {
  if (mode === 'collapsed') return [
    ...history(pages * 10, 'older').reverse(), ...history(10, 'anchor'),
    { id: 'answer', type: 'agentMessage', phase: 'final_answer', text: '折叠历史测试。' },
  ];
  if (mode === 'progress') return Array.from({ length: 50 }, (_, index) => ({
    id: `history-${index}`, type: 'userMessage', text: `历史消息 ${index}`,
  }));
  if (mode === 'history') return [
    ...Array.from({ length: pages * 25 }, (_, index): Item => ({
      id: `older-${index}`, type: 'userMessage', text: `更早消息 ${index}`,
    })),
    ...Array.from({ length: 20 }, (_, index): Item => ({
      id: `anchor-${index}`, type: 'userMessage', text: `历史消息 ${index}`,
    })),
  ];
  return [...history(pages * 25, 'older'), ...history(mode === 'short' ? 1 : 90, 'anchor')];
}

function App() {
  const [fonts] = useFonts(Ionicons.font);
  const [mode, setMode] = useState<Mode>('long');
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [historyPages, setHistoryPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyLoad, setHistoryLoad] = useState<HistoryLoadResult>();
  const [historyRequests, setHistoryRequests] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setStep((value) => Math.min(STREAM_STEPS, value + 1)), STREAM_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => { if (step === STREAM_STEPS) setRunning(false); }, [step]);
  const items = fixtureItems(mode, historyPages);
  if (step) items.push({ id: 'reply', type: 'agentMessage', phase: 'commentary',
    text: LINE.repeat(12).slice(0, step * 3) });
  const thread: Thread = { id: 'scroll-fixture', cwd: '', preview: '', updatedAt: 1,
    turns: [{ id: 'turn', status: mode === 'collapsed' ? 'completed' : 'inProgress',
      items, ...(mode === 'long' ? { diff: DIFF } : {}) }] };
  const loadOlder = async () => {
    setHistoryRequests(count => count + 1);
    const startedAt = Date.now();
    setHistoryLoad(undefined);
    setLoadingMore(true);
    await new Promise((resolve) => setTimeout(resolve, HISTORY_DELAY_MS));
    setHistoryPages(historyPages + 1);
    const loaded = { ...thread, turns: [{ ...thread.turns![0],
      items: fixtureItems(mode, historyPages + 1) }] };
    setHistoryLoad(historyLoadResult(thread, loaded, startedAt));
    setLoadingMore(false);
  };
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#f4f4f4' }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 14, gap: 12 }}>
      {(['long', 'short', 'plain', 'progress', 'history', 'collapsed'] as const).map((value) => <Pressable key={value}
        accessibilityRole="button" onPress={() => {
          setMode(value); setRunning(false); setStep(0); setHistoryPages(0); setHistoryLoad(undefined);
          setHistoryRequests(0);
        }}><Text>{value}</Text></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel="Start stream"
        onPress={() => { setStep(0); setRunning(true); }}><Text>Start {step}</Text></Pressable>
    </View>
    <Text accessibilityLabel={`History requests ${historyRequests}`}>History requests {historyRequests}</Text>
    {fonts && <ChatMessages key={mode} thread={thread}
      hasMore={mode === 'collapsed' ? historyPages < 3 : ['short', 'history'].includes(mode) && !historyPages}
      loadOlder={loadOlder} loadingMore={loadingMore} historyLoad={historyLoad}
      processing={mode !== 'collapsed' && <ChatProcessing turn={thread.turns![0]} active />} />}
    <TextInput accessibilityLabel="Keyboard test" placeholder="Keyboard test"
      style={{ padding: 16, backgroundColor: 'white' }} />
  </SafeAreaView></SafeAreaProvider>;
}

registerRootComponent(App);
