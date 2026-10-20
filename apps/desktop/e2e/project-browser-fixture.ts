import type { ProjectBrowserRequest, ProjectDocument } from '../../../shared/project-browser/protocol';
import type { ProjectFilesResponse } from '../../../shared/remote-chat/projectFiles';

export const browserRoot = 'C:/project';
const documents: Record<string, string> = {
  'src/main.ts': 'export function greet(name: string) {\n  const message = `Hello, ${name}`;\n  return message;\n}\n',
  'notes.txt': 'Project notes\nFind this sentence\nA plain text paragraph\n\nSecond paragraph\nAnother line\n',
  'README.md': '# Project\n\nThis is plain documentation.\n',
  'settings.json': '{\n  "enabled": true,\n  "theme": "dark"\n}\n',
  'nested/子目录/测试.py': 'def hello():\n    return "你好"\n',
};
const revisions: Record<string, number> = {};
export const savedFiles: { path: string; text: string }[] = [];
export let conflict = false;
export function causeConflict() { conflict = true; }

export async function browserRequest<T>(request: ProjectBrowserRequest): Promise<T> {
  const path = request.operation === 'projectFiles' ? request.directory ?? '' : request.path;
  const relative = path.replace(`${request.cwd}/`, '');
  if (request.operation === 'projectFiles') {
    const prefix = relative ? `${relative}/` : '';
    const names = new Map<string, boolean>();
    for (const name of [...Object.keys(documents), 'archive.zip', 'huge.txt']) {
      if (!name.startsWith(prefix)) continue;
      const rest = name.slice(prefix.length).split('/');
      names.set(rest[0], rest.length > 1);
    }
    const data: ProjectFilesResponse = { directory: path || request.cwd, parent: relative ? request.cwd : null,
      truncated: false, entries: [...names].map(([name, directory]) => ({
        name, directory, path: `${request.cwd}/${prefix}${name}`,
      })).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)) };
    return data as T;
  }
  if (request.operation === 'projectFileWrite') {
    if (conflict || request.revision !== String(revisions[relative] ?? 0)) {
      throw new Error('文件已在其他地方修改。请先复制你的修改，再重新加载文件。');
    }
    savedFiles.push({ path: request.path, text: request.text });
    documents[relative] = request.text; revisions[relative] = (revisions[relative] ?? 0) + 1;
  }
  const kind = relative === 'archive.zip' ? 'binary' : relative === 'huge.txt' ? 'large' : 'text';
  const data: ProjectDocument = { path: request.path, kind, size: kind === 'large' ? 3_000_000 : 120,
    readOnly: kind !== 'text', revision: String(revisions[relative] ?? 0), text: documents[relative] };
  return data as T;
}
