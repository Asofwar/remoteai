import { useState } from 'react';
import { Button, Dialog, Switch } from 'antd-mobile';
import { ChevronRight, Grid2X2, IdCard, Info, LockKeyhole, LogOut,
  RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks';
import { signOut } from '../store';
import type { useTotpVault } from '../useTotpVault';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { version } from '../../../../package.json';
import { SettingsRow } from './SettingsRow';
import { loadRefreshMinutes } from './refreshInterval';
import { RefreshIntervalSheet } from './RefreshIntervalSheet';
import { PasswordSheet } from './PasswordSheet';
import { AboutPage } from './AboutPage';
import './styles.css';

type Panel = 'profile' | 'identity' | 'refresh' | 'totp' | 'password' | 'about' | null;

export function SettingsPage({ totpManager }: { totpManager: ReturnType<typeof useTotpVault> }) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(state => state.auth.session);
  const profile = useAppSelector(state => state.data.profile) ?? session?.profile;
  const [panel, setPanel] = useState<Panel>(null);
  const [minutes, setMinutes] = useState(loadRefreshMinutes);
  const email = profile?.email || session?.email || '';
  const role = profile?.roleName || (profile?.role === 'admin' ? '管理员' : '用户');
  const close = () => setPanel(null);
  const logout = async () => {
    const confirmed = await Dialog.confirm({ title: '退出当前账号？',
      content: '退出后需要重新登录，云端数据会保留。', confirmText: '退出登录', cancelText: '继续使用' });
    if (confirmed) void dispatch(signOut());
  };
  if (panel === 'about') return <AboutPage onBack={close} />;
  return <>
    <div className="page-body settings-page">
      <div className="settings-layout"><section className="settings-group settings-profile-group">
        <button type="button" className="settings-profile" onClick={() => setPanel('profile')} aria-label="查看用户信息">
          <span className="settings-avatar">{email.slice(0, 2).toUpperCase()}</span>
          <span><strong>{email}</strong><small>Codex Switch 云端账号</small></span><ChevronRight size={20} /></button>
        <SettingsRow label="用户信息" value={email} icon={UserRound} tone="blue" onClick={() => setPanel('profile')} />
        <SettingsRow label="身份信息" value={role} icon={IdCard} tone="blue" onClick={() => setPanel('identity')} />
      </section>
      <div className="settings-preferences">
        <section className="settings-group">
          <SettingsRow label="自动刷新用量" value={`${minutes} 分钟`} icon={RefreshCw}
            onClick={() => setPanel('refresh')} />
          <SettingsRow label="2FA 密钥" value={totpManager.cloudSyncEnabled ? '已开启' : '未开启'} icon={ShieldCheck}
            onClick={() => setPanel('totp')} />
        </section>
        {profile?.role === 'admin' && <section className="settings-group">
          <SettingsRow label="管理控制台" icon={Grid2X2}
            onClick={() => window.location.assign(`${session?.baseUrl ?? window.location.origin}/admin`)} />
        </section>}
        <section className="settings-group"><SettingsRow label="修改密码" icon={LockKeyhole} tone="orange"
          onClick={() => setPanel('password')} /></section>
        <section className="settings-group"><SettingsRow label="关于 Codex Switch" value={`v${version}`}
          icon={Info} tone="blue" onClick={() => setPanel('about')} /></section>
      </div></div>
      <Button className="settings-logout" block color="danger" fill="outline" onClick={() => void logout()}>
        <LogOut size={21} />退出登录</Button>
    </div>
    <AdaptiveSheet open={panel === 'profile' || panel === 'identity'} onClose={close} width={400}
      title={panel === 'identity' ? '身份信息' : '用户信息'}>
      <dl className="settings-profile-details"><dt>邮箱</dt><dd>{email}</dd><dt>身份</dt><dd>{role}</dd></dl>
    </AdaptiveSheet>
    <AdaptiveSheet open={panel === 'totp'} title="2FA 密钥" onClose={close} width={400}>
      <div className="settings-sync"><div><strong>云端同步</strong>
        <p>开启后，在手机和网页上使用同一组 2FA 密钥。</p></div>
        <Switch aria-label="云端同步" checked={totpManager.cloudSyncEnabled} disabled={totpManager.syncing}
          onChange={totpManager.setCloudSyncEnabled} /></div>
    </AdaptiveSheet>
    {panel === 'refresh' && <RefreshIntervalSheet minutes={minutes} onSaved={setMinutes} onClose={close} />}
    {panel === 'password' && <PasswordSheet onClose={close} />}
  </>;
}
