import { useState } from 'react';
import { ChevronDown, FileText, Folder } from 'lucide-react';
import type { DiffFile } from '../../../../shared/chat/diff';
import { groupDiffFiles } from '../../../../shared/chat/diffGroups';
import { ChatCopyButton } from './ChatCopyButton';

const PAGE_LINES = 160;
function DiffContent({ file }: { file: DiffFile }) {
  const [limit, setLimit] = useState(PAGE_LINES);
  return <div className="chat-diff-content">
    <ChatCopyButton text={file.raw} label="复制差异" />
    <pre tabIndex={0} onScroll={event => {
      const node = event.currentTarget;
      if (node.scrollHeight - node.scrollTop - node.clientHeight < 100) setLimit(value => value + PAGE_LINES);
    }}>{file.lines.slice(0, limit).map((line, index) =>
      <span className={`chat-diff-line ${line.kind}`} key={index}>
        <span>{line.oldLine ?? ''}</span><span>{line.newLine ?? ''}</span>
        <code>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}{line.text}{'\n'}</code>
      </span>)}</pre>
    {limit < file.lines.length && <button type="button" className="chat-text-action"
      onClick={() => setLimit(value => value + PAGE_LINES)}>显示更多差异</button>}
  </div>;
}

export function ChatDiff({ files }: { files: DiffFile[] }) {
  return <div className="chat-diff">{groupDiffFiles(files).map(group =>
    <section key={group.directory}><h3><Folder size={17} />{group.showPath ? group.directory : group.name}</h3>
      {group.entries.map(({ file, index }) => <details key={index} className="chat-diff-file">
        <summary><FileText size={16} /><span title={file.path}>{file.path.split(/[\\/]/).at(-1)}</span>
          <b className="chat-added">+{file.added}</b><b className="chat-removed">−{file.removed}</b>
          <ChevronDown size={15} /></summary>
        {file.previousPath && <p className="chat-muted">原路径：{file.previousPath}</p>}
        <DiffContent file={file} />
      </details>)}
    </section>)}</div>;
}
