import { useMemo } from 'react';
import { gitGraph, GRAPH_ROW_HEIGHT } from '../../../../../shared/remote-chat/gitGraph';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t, getLocale } from '../../i18n';
import './gitHistory.css';

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
};

export function GitHistory({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const graph = useMemo(() => gitGraph(panel.commits), [panel.commits]);
  return <div className="git-history">
    {!panel.busy && !panel.commits.length && <p className="git-notice">{t('还没有提交记录。')}</p>}
    {graph.rows.map(row => <button type="button" key={row.commit.hash} className="git-history-row"
      style={{ minWidth: `calc(${row.width}px + var(--git-history-content-width, 560px))` }}
      disabled={!connected || panel.busy} onClick={() => panel.setDetail({ kind: 'files', commit: row.commit })}>
      <svg className="git-history-graph" width={row.width} aria-hidden="true">
        {row.lines.map((line, index) => <line key={index} x1={line.x1} x2={line.x2}
          y1={`${line.y1 / GRAPH_ROW_HEIGHT * 100}%`} y2={`${line.y2 / GRAPH_ROW_HEIGHT * 100}%`}
          stroke={line.color} strokeWidth="1.5" />)}
        <circle cx={row.x} cy="50%" r="4" fill={row.color}
          stroke="var(--git-surface, white)" strokeWidth="1.5" />
      </svg>
      <span className="git-history-text">
        <span className="git-history-summary"><strong>{row.commit.subject}</strong>
          <span className="git-refs">{row.commit.refs.map(ref => <em key={ref}>{ref}</em>)}</span>
        </span>
        <small className="git-history-hash">{row.commit.hash.slice(0, 8)}</small>
        <small className="git-history-author">{row.commit.author}</small>
        <time dateTime={row.commit.date}>{new Date(row.commit.date).toLocaleString(getLocale(), DATE_FORMAT)}</time>
      </span>
    </button>)}
    {panel.hasMore && <button type="button" className="git-more" disabled={panel.busy || !connected}
      onClick={() => void panel.more()}>{t('加载更多提交')}</button>}
  </div>;
}
