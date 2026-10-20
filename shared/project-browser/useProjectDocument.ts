import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectBrowserClient, ProjectDocument } from './protocol';
import { browserError } from './useProjectTree';

export function useProjectDocument(client: ProjectBrowserClient, cwd: string) {
  const [document, setDocument] = useState<ProjectDocument>();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const request = useRef(0);
  const writing = useRef(false);
  const latest = useRef({ document, text });
  latest.current = { document, text };
  useEffect(() => () => { request.current += 1; }, [client, cwd]);
  const open = useCallback(async (path: string) => {
    if (writing.current) return;
    const current = ++request.current;
    setLoading(true); setError(''); setSaved(false);
    try {
      const result = await client.read({ cwd, path });
      if (current !== request.current) return;
      setDocument(result); setText(result.text ?? ''); setEditorVersion(value => value + 1);
    } catch (failure) { if (current === request.current) setError(browserError(failure)); }
    finally { if (current === request.current) setLoading(false); }
  }, [client, cwd]);
  const save = useCallback(async () => {
    const { document: file, text: content } = latest.current;
    if (!file || file.kind !== 'text' || file.readOnly || writing.current) return false;
    writing.current = true; setSaving(true); setError(''); setSaved(false);
    const current = request.current;
    try {
      const result = await client.save({ cwd, path: file.path, text: content, revision: file.revision });
      if (current !== request.current) return false;
      // Preserve edits made while the save was in flight.
      setDocument(result); setSaved(true);
      return true;
    } catch (failure) {
      if (current === request.current) setError(browserError(failure));
      return false;
    } finally { writing.current = false; if (current === request.current) setSaving(false); }
  }, [client, cwd]);
  const edit = useCallback((value: string) => { setText(value); setSaved(false); }, []);
  return { document, text, loading, saving, error, saved, editorVersion, open, save, edit,
    dirty: document?.kind === 'text' && text !== document.text };
}
