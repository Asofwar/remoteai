import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatScroll } from './useChatScroll';
import { useHistoryRefresh } from './useHistoryRefresh';
import { ChatMessage } from './ChatMessage';
import { ChatToolDetails } from './ChatToolDetails';
import { ChatWorkDrawer } from './ChatWorkDrawer';
import { ChatProcessSummary } from './ChatProcessSummary';
import { ChatTurnDuration, ChatTurnSummary, type TurnPanel } from './ChatTurnSummary';
import { ChatTurnDetails } from './ChatTurnDetails';
import { findWorkEntry, type TurnEntry } from './turnPresentation';
import { useConversationEntries } from './useConversationEntries';
import type { ChatMessagesProps } from '../../../../shared/remote-chat/client/messageProps';
import { palette, styles } from './styles';

type Selection = { type: 'work'; id: string } | { type: 'item'; id: string; workId?: string }
  | { type: 'turn'; id: string; panel: TurnPanel };

const PROCESS_SEPARATOR_STYLE = { height: 14 };

function MessageSeparator({ leadingItem }: { leadingItem?: TurnEntry }) {
  const process = leadingItem?.kind === 'process' || (leadingItem?.kind === 'work' && leadingItem.inline);
  return <View style={process ? PROCESS_SEPARATOR_STYLE : styles.messageSeparator} />;
}

const TimelineEntry = memo(function TimelineEntry({ entry, open, onInline }: {
  entry: TurnEntry; open: (selection: Selection) => void; onInline: (turnId: string, inline: boolean) => void;
}) {
  const openItem = useCallback((id: string) => {
    if (entry.kind === 'process') onInline(entry.turn.id, true);
    open({ type: 'item', id });
  }, [open, onInline, entry.kind, entry.turn.id]);
  if (entry.kind === 'duration') return <ChatTurnDuration turn={entry.turn} />;
  if (entry.kind === 'summary') return <ChatTurnSummary turn={entry.turn}
    onOpen={(id, panel) => open({ type: 'turn', id, panel })} />;
  if (entry.kind === 'work') return <ChatProcessSummary entry={entry} onInline={onInline}
    onOpen={() => open({ type: 'work', id: entry.id })} />;
  return <ChatMessage item={entry.item} process={entry.kind === 'process'}
    onOpen={openItem}
    running={entry.turn.status === 'inProgress' && entry.item.status !== 'completed'} />;
});

export function ChatMessages({ thread, loading, loadingMore, hasMore, loadOlder, offline }: ChatMessagesProps) {
  const turns = useMemo(() => (thread?.turns ?? []).map((turn) => offline && turn.status === 'inProgress'
    ? { ...turn, status: 'cached' } : turn), [thread?.turns, offline]);
  const { entries, hasObservedLiveTurn, setInline } = useConversationEntries(turns);
  const { list, more, preservePosition, historyBottomSpace, initializing, onItemLayout, onFooterLayout,
    showScrollToBottom, scrollToBottom, ...scrollHandlers }
    = useChatScroll<TurnEntry>({ hasMore, loading, loadingMore, loadOlder,
      latestItemId: entries.at(-1)?.id, bottomPadding: styles.messages.padding });
  const refresh = useHistoryRefresh(more, loadingMore);
  // Expanded group headers can be replaced when an older page extends the group; anchor a message instead.
  const firstMessageIndex = entries[0]?.kind === 'work' && entries[0].inline ? 1 : 0;
  // Keep live messages visible through completion, including replies that never call tools.
  const showInitialLoading = (!hasObservedLiveTurn && initializing) || (loading && !loadingMore && !entries.length);
  const [selection, setSelection] = useState<Selection | null>(null);
  const open = useCallback((value: Selection) => { Keyboard.dismiss(); setSelection(value); }, []);
  // Resolve against live history so open process, plan, output and diff drawers keep receiving updates.
  const selectedEntry = selection?.type === 'work' ? findWorkEntry(entries, selection.id) : undefined;
  const selectedTool = selection?.type === 'item'
    ? thread?.turns?.flatMap((turn) => turn.items).find((item) => item.id === selection.id) : undefined;
  const selectedTurn = selection?.type === 'turn' ? thread?.turns?.find((turn) => turn.id === selection.id) : undefined;
  const workId = selection?.type === 'item' ? selection.workId : undefined;
  const close = () => setSelection(null);
  return <><View style={styles.fill}><FlatList ref={list} data={entries} keyExtractor={(entry) => entry.id}
    style={showInitialLoading && styles.messageListLoading}
    pointerEvents={showInitialLoading ? 'none' : 'auto'} accessibilityElementsHidden={showInitialLoading}
    importantForAccessibility={showInitialLoading ? 'no-hide-descendants' : 'auto'}
    contentContainerStyle={entries.length ? styles.messages : styles.empty}
    renderItem={({ item: entry }) => <View collapsable={false} onLayout={() => onItemLayout(entry.id)}>
      <TimelineEntry entry={entry} open={open} onInline={setInline} />
    </View>}
    ItemSeparatorComponent={MessageSeparator}
    keyboardShouldPersistTaps="handled" initialNumToRender={10}
    // Keep message views attached while the keyboard changes the native clipping bounds.
    removeClippedSubviews={false}
    alwaysBounceVertical
    refreshControl={<RefreshControl {...refresh} colors={[palette.green]} tintColor={palette.green}
      progressBackgroundColor={palette.background} />}
    // FlatList accounts for the list header itself, including in one-message conversations.
    maintainVisibleContentPosition={preservePosition ? { minIndexForVisible: firstMessageIndex } : undefined}
    {...scrollHandlers} scrollEventThrottle={100}
    ListHeaderComponent={<View style={hasMore && [styles.historyStatus, styles.messageHeader]}>
      {hasMore && (loadingMore ? <>
        <ActivityIndicator size="small" accessibilityLabel="正在加载聊天记录" />
        <Text style={styles.subtitle}>正在加载聊天记录…</Text>
      </> : <Pressable accessibilityRole="button" onPress={more}>
        <Text style={styles.subtitle}>加载更早的消息</Text>
      </Pressable>)}
    </View>}
    ListEmptyComponent={showInitialLoading ? null : <View style={styles.empty}>
      <Ionicons name="terminal-outline" size={28} color={palette.green} />
      <Text style={styles.title}>想一起完成什么？</Text>
      <Text style={[styles.subtitle, styles.centerText]}>直接提问，或选择一个项目开始任务。</Text>
    </View>}
    ListFooterComponent={<View style={[styles.messageFooter, { paddingBottom: historyBottomSpace }]}
      onLayout={onFooterLayout} />} />
    {showScrollToBottom && !showInitialLoading && entries.length > 0 && <Pressable
      accessibilityRole="button" accessibilityLabel="回到底部" onPress={scrollToBottom}
      style={({ pressed }) => [styles.scrollToBottom, pressed && styles.scrollToBottomPressed]}>
      <Ionicons name="arrow-down" size={18} color={palette.ink} />
      <Text style={styles.scrollToBottomText}>回到底部</Text>
    </Pressable>}
    {showInitialLoading && <View style={styles.messageLoadingOverlay}>
      <ActivityIndicator size="small" accessibilityLabel="正在加载聊天记录" />
      <Text style={[styles.subtitle, styles.messageLoadingText]}>正在加载聊天记录…</Text>
    </View>}
    </View>
    {selectedEntry?.kind === 'work' && <ChatWorkDrawer entry={selectedEntry} onClose={close}
      onOpen={(id) => open({ type: 'item', id, workId: selectedEntry.id })} />}
    {selectedTool && <ChatToolDetails key={selectedTool.id} item={selectedTool} onClose={close}
      onBack={workId ? () => open({ type: 'work', id: workId }) : undefined} />}
    {selectedTurn && selection?.type === 'turn' && <ChatTurnDetails turn={selectedTurn}
      panel={selection.panel} onClose={close} />}
  </>;
}
