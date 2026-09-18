import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle, Plus, RefreshCw, Search } from 'lucide-react';
import type { ChatController, ChatProject, ChatState } from './types';
import { threadPresentation } from '../../../../shared/remote-chat/sidebar';
import { useThreadGroups } from '../../../../shared/remote-chat/client/useThreadGroups';
import { useThreadListScroll } from './useThreadListScroll';

interface Props {
  state: ChatState; controller: ChatController; newChat: (project?: ChatProject) => void; onClose: () => void;
  openSearch: () => void; profile: ReactNode;
}

export function ChatThreads({ state, controller, newChat, onClose, openSearch, profile }: Props) {
  const { groups, toggle, toggleCollapse } = useThreadGroups(state);
  const pagination = useThreadListScroll(state, controller);
  const ready = state.ready;
  return <>
    <div className="chat-padded chat-thread-controls">
      <button type="button" className="chat-search-trigger" aria-label="搜索聊天" onClick={openSearch}>
        <Search size={18} />搜索聊天</button>
      <div className="chat-row">
        <button className="chat-button chat-grow" type="button" disabled={!ready || state.loading}
          onClick={() => { void controller.list({ archived: !state.archived }); }}>
          {state.archived ? '已归档 ▾' : '最近聊天 ▾'}</button>
        <button className="chat-back" type="button" aria-label="刷新聊天" disabled={!ready || state.loading}
          onClick={() => { void controller.list(); }}><RefreshCw size={17} /></button>
      </div>
    </div>
    <div ref={pagination.list} className="chat-scroll chat-thread-list" aria-busy={state.loading}>
      {groups.map((group) =>
        <section className="chat-project-group" aria-label={group.label} key={group.cwd}>
          <div className="chat-project-heading">
            <h3 className="chat-grow"><button type="button" className="chat-project-toggle"
              aria-expanded={!group.collapsed} aria-label={`${group.collapsed ? '展开项目' : '折叠项目'}：${group.label}`}
              onClick={() => toggleCollapse(group.cwd)}>
              {group.collapsed ? <ChevronRight size={14} aria-hidden="true" />
                : <ChevronDown size={14} aria-hidden="true" />}
              <span className="chat-ellipsis">{group.label}</span>
            </button></h3>
            {group.cwd && <button type="button" className="chat-back" aria-label={`在 ${group.label} 中新建对话`}
              disabled={state.sending} onClick={() => newChat(group)}><Plus size={18} aria-hidden="true" /></button>}
          </div>
          {group.data.map((thread) => {
            const view = threadPresentation(thread, state.sidebar);
            return <button type="button" className="chat-thread" key={thread.id} aria-label={view.title}
              aria-current={state.selected?.id === thread.id ? 'page' : undefined} disabled={!ready || state.sending}
              onClick={() => { void controller.select(thread); onClose(); }}>
              <span className="chat-grow chat-ellipsis">{view.title}</span>
              <span className="chat-thread-status">{view.running
                ? <LoaderCircle size={14} className="chat-spinner" aria-label="正在回复" />
                : view.unread && <span className="chat-unread-dot" aria-label="未读回复" />}</span>
            </button>;
          })}
          {group.canToggle && <button type="button" className="chat-group-more" aria-expanded={group.expanded}
            aria-label={`${group.expanded ? '收起' : '展开显示'}：${group.label}`} onClick={() => toggle(group.cwd)}>
            {group.expanded ? '收起' : '展开显示'}</button>}
        </section>)}
      {!state.threads.length && <p className="chat-empty chat-muted">
        {ready ? '暂时没有聊天' : '连接电脑后查看聊天'}</p>}
      <div ref={pagination.end} className="chat-thread-pagination">
        {pagination.loadingMore && <span role="status" className="chat-muted chat-row">
          <LoaderCircle size={16} className="chat-spinner" aria-hidden="true" />正在加载…</span>}
        {state.cursor && pagination.failed && <button type="button" className="chat-button"
          disabled={!ready || state.loading} onClick={pagination.retry}>加载失败，点击重试</button>}
      </div>
    </div>
    <div className="chat-drawer-footer"><button className="chat-new-button" type="button"
      disabled={state.sending} onClick={() => newChat()}><Plus size={20} />新聊天</button>{profile}</div>
  </>;
}
