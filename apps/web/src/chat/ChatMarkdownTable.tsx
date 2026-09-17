import { useRef, useState, type ReactNode } from 'react';
import { Copy, Maximize2, X } from 'lucide-react';
import { copyText } from '../components/copyText';

export function ChatMarkdownTable({ children }: { children?: ReactNode }) {
  const table = useRef<HTMLTableElement>(null);
  const [expanded, setExpanded] = useState(false);
  const copy = () => {
    const text = Array.from(table.current?.rows ?? [], row =>
      Array.from(row.cells, cell => (cell.textContent ?? '').trim()).join('\t')).join('\n');
    void copyText('表格', text);
  };
  return <div className="chat-markdown-table">
    <div className="chat-table-viewport" tabIndex={0} role="region" aria-label="表格">
      <table ref={table}>{children}</table>
    </div>
    <div className="chat-table-actions">
      <button type="button" aria-label="展开表格" onClick={() => setExpanded(true)}><Maximize2 size={14} /></button>
      <button type="button" aria-label="复制表格" onClick={copy}><Copy size={14} /></button>
    </div>
    {expanded && <dialog ref={node => { if (node && !node.open) node.showModal(); }}
      className="chat-table-dialog" aria-label="表格" onCancel={() => setExpanded(false)}>
      <header><strong>表格</strong><button type="button" aria-label="关闭表格" onClick={() => setExpanded(false)}>
        <X size={18} /></button></header>
      <div className="chat-expanded-table chat-markdown">
        <button type="button" className="chat-text-action" aria-label="复制表格" onClick={copy}>
          <Copy size={14} />复制表格</button>
        <div className="chat-table-viewport" tabIndex={0} role="region" aria-label="完整表格">
          <table>{children}</table>
        </div>
      </div>
    </dialog>}
  </div>;
}
