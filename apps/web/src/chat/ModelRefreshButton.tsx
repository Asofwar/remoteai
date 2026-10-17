import { useState } from 'react';
import { t } from '../i18n';

export function ModelRefreshButton({ ready, refreshModels }: { ready: boolean; refreshModels: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshModels(); } finally { setRefreshing(false); }
  };
  return <button type="button" className="chat-button" disabled={!ready || refreshing}
    onClick={() => { void refresh(); }}>{t(refreshing ? '正在刷新模型…' : '刷新模型')}</button>;
}
