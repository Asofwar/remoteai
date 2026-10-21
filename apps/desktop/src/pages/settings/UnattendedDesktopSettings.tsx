import { useEffect, useState } from 'react';
import { Alert, Button } from 'antd';
import { Check, Info, LockKeyhole } from 'lucide-react';
import { invoke } from '../../api/backend';
import { guiText } from '../../i18n/guiText';
import styles from './RemoteDesktopSettingsModal.module.less';

interface Status { supported: boolean; installed: boolean; running: boolean }

/** Chinese sources only; translated at render time with guiText. */
const features = [
  { title: '随时远程访问', description: '锁屏或尚未登录时也可连接' },
  { title: '云端账号绑定', description: '使用绑定的账号跨设备访问' },
  { title: '管理员确认', description: '启用和停用均需管理员确认' },
];

function useUnattendedDesktopSettings() {
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void invoke<Status>('remote_desktop_service_status').then(value => { if (active) setStatus(value); })
      .catch(() => { /* Other operating systems and older hosts do not offer this optional Windows service. */ });
    return () => { active = false; };
  }, []);
  const change = async (install: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const command = install ? 'remote_desktop_service_install' : 'remote_desktop_service_uninstall';
      setStatus(await invoke<Status>(command));
    }
    catch (error) {
      setError(typeof error === 'string' ? error : '无人值守设置未能完成，请重试。');
      try { setStatus(await invoke<Status>('remote_desktop_service_status')); }
      catch { setStatus(current => current && { ...current, running: false }); }
    }
    finally { setBusy(false); }
  };
  return { status, busy, error, change };
}

function serviceStatusLabel(status: Status) {
  if (!status.installed) return guiText('尚未启用');
  return guiText(status.running ? '正在运行' : '已启用，尚未运行');
}

export function UnattendedDesktopSettings({ allowed }: { allowed: boolean }) {
  const { status, busy, error, change } = useUnattendedDesktopSettings();
  if (!status?.supported) return null;
  return <section className={styles.unattended} aria-label={guiText('无人值守')}>
    <div className={styles.unattendedCard}>
      <span className={styles.unattendedIcon}><LockKeyhole size={29} strokeWidth={1.8} aria-hidden /></span>
      <div className={styles.unattendedCopy}>
        <div className={styles.unattendedHeading}>
          <h3>{guiText('无人值守')}</h3>
          <span role="status" className={styles.serviceStatus}
            data-running={status.running}>{serviceStatusLabel(status)}</span>
        </div>
        <p>{guiText('启用后，无需有人守在电脑前，即可用手机或网页远程访问。')}</p>
        <p>{guiText('需先登录云端账号，并由这台电脑的管理员确认。')}</p>
      </div>
      <div className={styles.unattendedActions}>
        <Button disabled={busy || !allowed} loading={busy} onClick={() => void change(true)}>
          {guiText(status.installed ? '更新或重新启用' : '启用无人值守')}</Button>
        {status.installed && <Button danger disabled={busy} onClick={() => void change(false)}>
          {guiText('停用并卸载')}</Button>}
      </div>
    </div>
    {!!error && <Alert type="error" showIcon message={guiText(error)} className={styles.error} />}
    <ul className={styles.features}>
      {features.map(feature => <li key={feature.title}>
        <span className={styles.featureCheck}><Check size={17} strokeWidth={2.5} aria-hidden /></span>
        <div><h4>{guiText(feature.title)}</h4><p>{guiText(feature.description)}</p></div>
      </li>)}
    </ul>
    <p className={styles.accountNotice}>
      {guiText('无人值守绑定启用时的云端账号，退出应用或账号后仍会运行。停止访问请在此停用。')}</p>
    <div className={styles.updateNotice}>
      <Info size={19} aria-hidden />
      <p>{guiText('每次启动应用时会检查无人值守更新，需要时请确认管理员提示。')}</p>
    </div>
  </section>;
}
