import { useEffect, useRef, useState } from 'react';
import { getChatGptLaunchPath, setChatGptLaunchPath } from '../api/chatgptLaunchPath';

type PathError = 'load' | 'save' | 'invalid';

export function useChatGptLaunchPath() {
  const [path, setPath] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [detectedPath, setDetectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<PathError | null>(null);
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void getChatGptLaunchPath().then((settings) => {
      if (!active) return;
      setPath(settings.manualPath ?? '');
      setSavedPath(settings.manualPath ?? '');
      setDetectedPath(settings.detectedPath);
      setLoaded(true);
    }).catch(() => {
      if (active) setError('load');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const edit = (value: string) => {
    setPath(value);
    setError(null);
    setSaved(false);
  };

  const save = async () => {
    if (busy.current || loading || !loaded || path === savedPath) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const next = await setChatGptLaunchPath(path);
      if (!mounted.current) return;
      setPath(next ?? '');
      setSavedPath(next ?? '');
      setSaved(true);
    } catch (failure) {
      if (mounted.current) setError(failure === 'invalid' ? 'invalid' : 'save');
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  return { path, detectedPath, loading, loaded, error, saved, dirty: path !== savedPath, edit, save };
}
