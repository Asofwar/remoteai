import { useMemo, useState } from 'react';
import { FileEnvironmentContext, type FileEnvironment } from '../../desktop/src/pages/codexGui/fileEnvironment';
import { FileThreadContext } from '../../desktop/src/pages/codexGui/fileApi';
import { ChatDetailsWorkspace } from '../src/chat/ChatDetailsWorkspace';
import { ChatMarkdown } from '../src/chat/ChatMarkdown';
import { ChatFileContext } from '../src/chat/ChatFileLink';
import { ChatImageContext } from '../src/chat/ChatImage';

const documents: Record<string, string> = {
  'guide.md': '# 远程文档\n\n| 名称 | 内容 |\n|---|---|\n| 电脑 | 远程 PC |\n\n'
    + '```ts\nconst remote = true;\n```\n\n![相邻图片](photo.svg)\n\n[后续文档](next.md#L3)\n\n[页面](index.html)',
  'next.md': '# 后续文档\n\n这是远程电脑的第三行。',
  'index.html': '<h1>远程 HTML</h1><link rel="stylesheet" href="style.css"><img src="photo.svg">',
};

/** Real shared UI with a deterministic remote endpoint; transport is covered by native/RPC tests. */
export function PcFilePreviewFixture({ legacy = false }: { legacy?: boolean }) {
  const [action, setAction] = useState('');
  const environment = useMemo<FileEnvironment>(() => ({ remote: true,
    previews: {
      open: async target => {
        if (legacy) throw new Error('Unsupported operation');
        const name = target.path.split('/').at(-1)!;
        if (!(name in documents)) throw new Error('Remote file unavailable');
        return { ...target, name, sessionId: crypto.randomUUID(), text: documents[name],
          kind: name.endsWith('.html') ? 'html' : 'markdown',
          url: new URL(`remote-preview-assets/${name}`, location.href).href };
      }, close: async () => {},
    },
    actions: { applications: async () => [{ id: 'vscode', name: 'Visual Studio Code', kind: 'editor' }],
      perform: async (target, command) => {
        setAction(JSON.stringify({ computer: 'remote-PC', ...target, action: command.type }));
        return { path: target.path, saved: false };
      } },
    resolveWebsite: async () => new URL('remote-preview-assets/index.html', location.href).href,
    image: props => <img src={new URL('remote-preview-assets/photo.svg', location.href).href} alt={props.alt} />,
  }), [legacy]);
  const files = useMemo(() => legacy ? {
    threadId: 'remote-thread', ready: true,
    client: { open: async () => { throw new Error('Unused download'); }, read: async () => ({ offset: 0, data: '' }),
      close: async () => {} },
    load: async (_threadId: string, path: string) => ({ path,
      text: documents[path.split('/').at(-1)!].replace('(photo.svg)', '(photo.png)') }),
  } : null, [legacy]);
  const images = useMemo(() => ({ threadId: 'remote-thread', ready: true,
    load: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR'
      + '42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  }), []);
  return <div className="chat-page" style={{ height: '100dvh' }}>
    <FileEnvironmentContext.Provider value={environment}><FileThreadContext.Provider value="remote-thread">
      <ChatFileContext.Provider value={files}><ChatImageContext.Provider value={images}>
      <ChatDetailsWorkspace selected="remote-thread" active enabled>
        <ChatMarkdown text={'[交接文档](F:/remote/docs/guide.md)\n\n[远程网页](http://localhost:3000)'} />
        <output aria-label="文件操作结果">{action}</output>
      </ChatDetailsWorkspace>
      </ChatImageContext.Provider></ChatFileContext.Provider>
    </FileThreadContext.Provider></FileEnvironmentContext.Provider>
  </div>;
}
