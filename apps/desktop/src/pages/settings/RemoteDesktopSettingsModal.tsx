import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Switch, Tooltip, Typography } from 'antd';
import { Check, CircleHelp, Clipboard, Copy, FileText, Monitor, Mouse, Power, Upload, Volume2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { invoke } from '../../api/backend';
import { guiText } from '../../i18n/guiText';
import type { DesktopPermissions } from '../../../../../shared/remote-desktop/protocol';
import { UnattendedDesktopSettings } from './UnattendedDesktopSettings';
import { DesktopSystemPermissions } from './DesktopSystemPermissions';
import styles from './RemoteDesktopSettingsModal.module.less';

/** Chinese sources only; title and description are translated at render time with guiText. */
const fields: { key: keyof DesktopPermissions; title: string; description: string; icon: LucideIcon }[] = [
  { key: 'enabled', title: '允许远程访问桌面', description: '查看这台电脑的桌面', icon: Monitor },
  { key: 'control', title: '允许鼠标和键盘操作', description: '控制鼠标和键盘输入', icon: Mouse },
  { key: 'clipboardRead', title: '允许从电脑复制内容', description: '复制电脑中的文本和文件', icon: FileText },
  { key: 'clipboardWrite', title: '允许向电脑粘贴内容', description: '向电脑粘贴文本和文件', icon: Clipboard },
  { key: 'files', title: '允许通过剪贴板传输文件', description: '通过剪贴板发送和接收文件', icon: Upload },
  { key: 'audio', title: '允许播放电脑声音', description: '在访问设备上播放电脑声音', icon: Volume2 },
];

interface RemoteDesktopSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

function useRemoteDesktopSettings() {
  const [permissions, setPermissions] = useState<DesktopPermissions>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  useEffect(() => {
    let active = true;
    void invoke<string>('remote_chat_identity').then(value => { if (active) setFingerprint(value); })
      .catch(() => { if (active) setError('设备指纹暂时无法读取，请重启应用后重试。'); });
    void invoke<DesktopPermissions>('remote_desktop_permissions').then(value => {
      if (active) setPermissions(value);
    }).catch(() => { if (active) setError('远程桌面设置未能读取，请重新打开设置页面。'); });
    return () => { active = false; };
  }, []);
  const save = async (settings: DesktopPermissions) => {
    if (saving) return;
    setSaving(true); setError('');
    try { setPermissions(await invoke<DesktopPermissions>('remote_desktop_permissions', { settings })); }
    catch { setError('设置未能保存，请重试。'); }
    finally { setSaving(false); }
  };
  return { permissions, saving, error, fingerprint, save };
}

function PermissionCards({ permissions, saving, save }: ReturnType<typeof useRemoteDesktopSettings>) {
  return <div className={styles.permissions}>
    {fields.map(({ key, title, description, icon: Icon }) => <div key={key} className={styles.permission}>
      <span className={styles.permissionIcon}><Icon size={26} strokeWidth={1.7} aria-hidden /></span>
      <div className={styles.permissionCopy}>
        <label htmlFor={`remote-desktop-${key}`}>{guiText(title)}</label>
        <p id={`remote-desktop-${key}-description`}>{guiText(description)}</p>
      </div>
      <Switch id={`remote-desktop-${key}`} checked={permissions?.[key] ?? false}
        aria-describedby={`remote-desktop-${key}-description`}
        disabled={!permissions || saving || (key !== 'enabled' && !permissions.enabled)}
        onChange={value => permissions && void save({ ...permissions, [key]: value })} />
    </div>)}
  </div>;
}

function DeviceFingerprint({ value }: { value: string }) {
  return <section className={styles.fingerprint} aria-label={guiText('设备指纹')}>
    <div className={styles.fingerprintHeading}>
      <h3>{guiText('设备指纹')}</h3>
      <Tooltip title={guiText('用于核对这台电脑的身份，确保连接到正确的设备。')} styles={{ root: { maxWidth: 400 } }}>
        <button type="button" className={styles.help} aria-label={guiText('设备指纹说明')}>
          <CircleHelp size={18} aria-hidden />
        </button>
      </Tooltip>
    </div>
    <Typography.Text className={styles.fingerprintValue} copyable={{ text: value,
      icon: [<Copy size={19} key="copy" aria-hidden />, <Check size={19} key="copied" aria-hidden />],
      tooltips: [guiText('复制设备指纹'), guiText('已复制')], }}>
      <span>{value}</span>
    </Typography.Text>
  </section>;
}

export function RemoteDesktopSettingsModal({ open, onClose }: RemoteDesktopSettingsModalProps) {
  const settings = useRemoteDesktopSettings();
  const { permissions, saving, error, fingerprint, save } = settings;
  return <Modal title={guiText('远程设置')} open={open} onCancel={onClose} footer={null} width={880} centered
    className={styles.modal} closeIcon={<X size={22} aria-hidden />}>
    <div className={styles.content}>
      <p className={styles.intro}>
        {guiText('选择其他设备可以在这台电脑上进行的操作。更改权限会断开当前远程桌面连接。')}
      </p>
      <DesktopSystemPermissions active={open} />
      <PermissionCards {...settings} />
      <Button danger className={styles.disconnect} icon={<Power size={20} aria-hidden />}
        disabled={!permissions?.enabled || saving}
        onClick={() => permissions && void save({ ...permissions, enabled: false })}>{guiText('断开并暂停远程桌面')}</Button>
      {!!error && <Alert type="error" showIcon message={guiText(error)} className={styles.error} />}
      {!!fingerprint && <DeviceFingerprint value={fingerprint} />}
      <UnattendedDesktopSettings allowed={permissions?.enabled ?? false} />
    </div>
  </Modal>;
}
