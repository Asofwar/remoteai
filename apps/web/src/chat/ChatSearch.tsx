import { useState } from 'react';
import { MessageSquare, Search, X } from 'lucide-react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { useChatSearch } from '../../../../shared/chat/useChatSearch';
import { threadPresentation } from '../../../../shared/remote-chat/sidebar';
import type { ChatController, ChatState, Thread } from './types';

export function ChatSearch({ state, controller, onClose, select }: {
  state: ChatState; controller: ChatController; onClose: () => void; select: (thread: Thread) => void;
}) {
  const [query, setQuery] = useState('');
  const search = useChatSearch({ controller, query, archived: state.archived, ready: state.ready });
  const emptyMessage = !state.ready ? '连接电脑后即可搜索聊天'
    : query.trim() ? '没有找到相关聊天' : '输入关键词，查找聊天';
  return <AdaptiveSheet open title={state.archived ? '搜索已归档聊天' : '搜索聊天'} width={680} onClose={onClose}>
    <div className="chat-detail-stack">
      <form className="chat-search chat-row" onSubmit={event => { event.preventDefault(); search.reload(); }}>
        <Search size={18} /><input aria-label="搜索聊天" placeholder="搜索聊天" autoFocus value={query}
          onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" className="chat-back" aria-label="清空搜索" onClick={() => setQuery('')}>
          <X size={16} /></button>}<button type="submit" className="chat-back" aria-label="搜索"
          disabled={!state.ready || search.loading}><Search size={18} /></button>
      </form>
      <div className="chat-search-results chat-scroll">{search.threads.map(thread => {
        const view = threadPresentation(thread, state.sidebar);
        return <button key={thread.id} type="button" className="chat-thread" aria-label={view.title}
          disabled={!state.ready || state.sending} onClick={() => select(thread)}><MessageSquare size={20} />
          <span className="chat-grow"><span className="chat-ellipsis">{view.title}</span>
            <small className="chat-muted">{view.projectName}</small></span></button>;
      })}
        {!search.loading && !search.error && !search.threads.length && <p className="chat-empty chat-muted">
          {emptyMessage}</p>}
        {search.loading && <p role="status" className="chat-muted">正在搜索…</p>}
        {search.error && <><p role="alert" className="chat-error">{search.error}</p>
          <button type="button" className="chat-button" onClick={search.reload}>重试</button></>}
        {search.cursor && !search.loading && !search.error && <button type="button" className="chat-button"
          disabled={!state.ready} onClick={search.loadMore}>加载更多</button>}
      </div>
    </div>
  </AdaptiveSheet>;
}
