import { useState } from 'react';
import { Tooltip } from 'antd';
import { RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import './modelRefreshButton.css';

export function ModelRefreshButton({ ready, refreshModels }: { ready: boolean; refreshModels: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!ready || refreshing) return;
    setRefreshing(true);
    try { await refreshModels(); } finally { setRefreshing(false); }
  };
  const label = t(refreshing ? '正在刷新模型…' : '刷新模型');
  return <Tooltip title={label} styles={{ root: { maxWidth: 400 } }}>
    <button type="button" className="model-refresh-button" disabled={!ready || refreshing}
      aria-label={label} aria-busy={refreshing} onClick={() => { void refresh(); }}>
      <RefreshCw size={18} aria-hidden="true" />
    </button>
  </Tooltip>;
}
