import { useCallback, useState } from 'react';
import { Empty, PullToRefresh, SpinLoading, Toast } from 'antd-mobile';
import { ChevronRight, Laptop } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks';
import { refreshAll, switchDeviceAccount } from '../store';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { AddAccountSheet } from '../components/AddAccountSheet';
import { useRemoteModelRestartPrompt } from '../devices/useRemoteModelRestartPrompt';
import { AccountCard } from './AccountCard';
import { AccountOverview } from './AccountOverview';
import { AccountDetails } from './AccountDetails';
import { maskEmail } from './formatters';
import './styles.css';

const REFRESH_TEXT = { pulling: '下拉刷新', canRelease: '释放立即刷新', refreshing: '正在刷新…', complete: '刷新完成' };

export function AccountsPage() {
  const dispatch = useAppDispatch();
  const { accounts, devices, loading, refreshing, switchingAccountId, lastRefreshAt } = useAppSelector(s => s.data);
  const promptRestart = useRemoteModelRestartPrompt();
  const [privateMode, setPrivateMode] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [switchId, setSwitchId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const detail = accounts.find(account => account.id === detailId);
  const target = accounts.find(account => account.id === switchId);
  const online = devices.filter(device => device.online);
  const refresh = useCallback(async () => {
    try { await dispatch(refreshAll()).unwrap(); }
    catch { /* The global toast reports the failure. */ }
  }, [dispatch]);

  const switchAccount = async (deviceId: string) => {
    if (!target || switchingAccountId) return;
    try {
      const { result } = await dispatch(switchDeviceAccount({ deviceId, accountId: target.id })).unwrap();
      Toast.show({ icon: 'success', content: '已切换到官方模型' });
      setSwitchId(null);
      if (result.requiresRestart) window.setTimeout(() => void promptRestart(deviceId), 0);
    } catch { /* The global toast reports the failure. */ }
  };

  return <>
    <PullToRefresh onRefresh={refresh} renderText={status => REFRESH_TEXT[status]}>
      <div className="page-body accounts-page">
        <AccountOverview count={accounts.length} online={online.length} privateMode={privateMode}
          refreshing={refreshing} updatedAt={lastRefreshAt} onPrivacy={() => setPrivateMode(value => !value)}
          onRefresh={() => void refresh()} onAdd={() => setAdding(true)} />
        {loading ? <div className="page-loading"><SpinLoading /><span>正在读取账户概览</span></div>
          : !accounts.length ? <Empty description="暂无账号，点击“添加账户”开始使用" />
            : <div className="accounts-grid">{accounts.map(account => <AccountCard key={account.id}
              account={account} privateMode={privateMode} busy={Boolean(switchingAccountId)}
              switching={switchingAccountId === account.id} onOpen={() => setDetailId(account.id)}
              onSwitch={() => setSwitchId(account.id)} />)}</div>}
      </div>
    </PullToRefresh>
    {detail && <AccountDetails key={detail.id} account={detail} devices={devices} privateMode={privateMode}
      onClose={() => setDetailId(null)} onUpdated={refresh} />}
    <AddAccountSheet open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    <AdaptiveSheet open={Boolean(target)} title="切换到设备"
      subtitle={target ? (privateMode ? maskEmail(target.email) : target.email) : undefined}
      onClose={() => setSwitchId(null)}>
      {!online.length ? <Empty description="暂无在线设备，请先在电脑上打开 Codex Switch" />
        : <div className="select-list">{online.map(device => {
          const current = device.activeAccountId === target?.id && !device.activeProviderId;
          return <button key={device.deviceId} type="button" disabled={current || Boolean(switchingAccountId)}
            onClick={() => void switchAccount(device.deviceId)}>
            <span className="device-mini-icon"><Laptop size={19} /></span>
            <span><strong>{device.name}</strong><small>{device.platform} · 在线</small></span>
            {current ? <b className="current-pill">当前</b> : <ChevronRight size={18} />}
          </button>;
        })}</div>}
    </AdaptiveSheet>
  </>;
}
