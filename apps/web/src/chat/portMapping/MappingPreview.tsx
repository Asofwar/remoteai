import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Spin } from 'antd';
import { AdaptiveSheet } from '../../components/AdaptiveSheet';
import { t } from '../../i18n';
import type { MappingHttpRequest } from '../../../../../shared/port-mapping/http';
import { mappingUrl } from '../../../../../shared/port-mapping/http';
import type { WebMappingTunnel } from './httpTunnel';
import { attachPreview, PREVIEW_DOCUMENT } from './previewBridge';

export function MappingPreview({ tunnel, origin, close }: {
  tunnel: WebMappingTunnel; origin: string; close: () => void;
}) {
  const [input, setInput] = useState<MappingHttpRequest>({ url: origin + '/' });
  const [path, setPath] = useState('/');
  const [history, setHistory] = useState<MappingHttpRequest[]>([]);
  const [generation, setGeneration] = useState(0);
  const [presented, setPresented] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<() => void>();
  const navigate = (next: MappingHttpRequest) => {
    const url = mappingUrl(next.url, origin);
    setHistory(value => [...value, input]); setInput(next); setPath(url.pathname + url.search + url.hash);
    setStatus('loading'); setGeneration(value => value + 1);
  };
  const refresh = () => { cleanup.current?.(); setStatus('loading'); setGeneration(value => value + 1); };
  useEffect(() => () => cleanup.current?.(), []);
  return <AdaptiveSheet open title={t('端口映射预览')} onClose={close} width={1100} presentation="drawer"
    afterOpenChange={setPresented}
    className="port-mapping-preview">
    <form className="port-mapping-navigation" onSubmit={event => {
      event.preventDefault();
      try { navigate({ url: mappingUrl(path, origin).href }); } catch { setStatus('error'); }
    }}>
      <Button aria-label={t('返回')} disabled={!history.length} onClick={() => {
        const next = history.at(-1)!;
        setHistory(value => value.slice(0, -1)); setInput(next);
        setPath(new URL(next.url).pathname + new URL(next.url).search); refresh();
      }}>{t('返回')}</Button>
      <Input aria-label={t('网页路径')} value={path} onChange={event => setPath(event.target.value)} />
      <Button aria-label={t('打开')} htmlType="submit">{t('打开')}</Button>
      <Button aria-label={t('刷新')} onClick={refresh}>{t('刷新')}</Button>
    </form>
    <div className="port-mapping-notice" style={{ minHeight: 32 }}>
      {status === 'loading' && <><Spin size="small" /> {t('正在加载网页…')}</>}
      {status === 'error' && <Alert type="warning" message={t('网页未能完整加载，请确认服务已启动后刷新。')} />}
    </div>
    {presented && <iframe ref={frame} key={generation} title={t('端口映射预览')} sandbox="allow-scripts allow-forms"
      data-ready={status === 'ready'}
      referrerPolicy="no-referrer" srcDoc={PREVIEW_DOCUMENT} onLoad={() => {
        if (!frame.current || frame.current.dataset.attached) return;
        frame.current.dataset.attached = 'true';
        cleanup.current?.();
        cleanup.current = attachPreview({ frame: frame.current, tunnel, input, navigate, status: setStatus });
      }} />}
  </AdaptiveSheet>;
}
