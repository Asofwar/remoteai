import type { EntryRequest } from '../../../shared/project-browser/entryActions';

export function mutateFixture(request: EntryRequest, state: {
  documents: Record<string, string>; directories: Set<string>; revisions: Record<string, number>;
}) {
  const relative = (path: string) => path === request.cwd ? '' : path.replace(`${request.cwd}/`, '');
  const path = relative(request.path);
  const directory = state.directories.has(path);
  const exists = (name: string) => name in state.documents || state.directories.has(name);
  let destination = path;
  if (request.action === 'createFile' || request.action === 'createFolder') {
    destination = [path, request.name].filter(Boolean).join('/');
    if (exists(destination)) throw new Error('已有同名文件或文件夹，请换一个名称。');
    if (request.action === 'createFile') state.documents[destination] = '';
    else state.directories.add(destination);
  } else {
    if (request.action === 'rename') destination = [...path.split('/').slice(0, -1), request.name].join('/');
    if (request.action === 'move' || request.action === 'copy') {
      destination = [relative(request.directory), path.split('/').at(-1)].filter(Boolean).join('/');
      if (request.action === 'copy' && exists(destination)) destination += ' (copy)';
    }
    if (request.action !== 'delete' && exists(destination)) throw new Error('已有同名文件或文件夹，请换一个名称。');
    for (const name of Object.keys(state.documents)) {
      if (name !== path && !name.startsWith(`${path}/`)) continue;
      if (request.action !== 'delete') {
        state.documents[destination + name.slice(path.length)] = state.documents[name];
        state.revisions[destination + name.slice(path.length)] = state.revisions[name] ?? 0;
      }
      if (request.action !== 'copy') { delete state.documents[name]; delete state.revisions[name]; }
    }
    for (const name of [...state.directories]) {
      if (name !== path && !name.startsWith(`${path}/`)) continue;
      if (request.action !== 'delete') state.directories.add(destination + name.slice(path.length));
      if (request.action !== 'copy') state.directories.delete(name);
    }
  }
  return { path: `${request.cwd}/${destination}`, directory: request.action === 'createFolder' || directory };
}
