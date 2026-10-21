import { Alert, Button, Popconfirm, Space, Typography } from 'antd';
import { useDesktopSystemPermissions } from './useDesktopSystemPermissions';
import type { ComputerUsePermission } from '../../api/computerUse';
import { guiText } from '../../i18n/guiText';
import { useGuiLanguage } from '../../i18n/useGuiLanguage';

/** Chinese sources only; each field is translated at render time with guiText. */
const PERMISSIONS: {
  key: ComputerUsePermission; title: string; description: string;
  enableLabel: string; repairTitle: string; repairLabel: string; repairDescription: string;
}[] = [
  { key: 'screenRecording', title: '屏幕录制', description: '让其他设备看到这台 Mac 的画面。',
    enableLabel: '开启屏幕录制', repairTitle: '修复屏幕录制权限？', repairLabel: '修复屏幕录制权限',
    repairDescription: '将清除 Remote AI 的屏幕录制授权，相关远程操作可能中断。请重新授权后重启应用。' },
  { key: 'accessibility', title: '辅助功能', description: '允许远程操作鼠标和键盘。',
    enableLabel: '开启辅助功能', repairTitle: '修复辅助功能权限？', repairLabel: '修复辅助功能权限',
    repairDescription: '将清除 Remote AI 的辅助功能授权，相关远程操作可能中断。请重新授权后重启应用。' },
];

export function DesktopSystemPermissions({ active }: { active: boolean }) {
  useGuiLanguage();
  const { permissions, error, busy, request, repair, restart } = useDesktopSystemPermissions(active);
  if (!permissions) return null;
  const needsRestart = !!permissions.restartRequired?.length;
  return <Space direction="vertical" style={{ width: '100%', maxWidth: 400 }}>
    <Typography.Text strong>{guiText('Mac 访问权限')}</Typography.Text>
    {PERMISSIONS.map(({ key, title, description, enableLabel, repairTitle, repairLabel, repairDescription }) => {
      const repaired = permissions.restartRequired?.includes(key);
      return <div key={key}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>{guiText(title)}<div><Typography.Text type="secondary">{guiText(description)}</Typography.Text></div></div>
          {permissions[key] ? <span style={{ flexShrink: 0 }}>{guiText('已开启')}</span>
            : <Button disabled={busy || !active} onClick={() => void request(key)}
              aria-label={guiText(enableLabel)}>{guiText('去开启')}</Button>}
        </div>
        {repaired ? <Typography.Text type="secondary">{guiText('重新授权后请重启应用')}</Typography.Text>
          : <Popconfirm title={guiText(repairTitle)} open={active ? undefined : false}
            description={guiText(repairDescription)}
            okText={guiText('重置并去授权')} cancelText={guiText('取消')} disabled={busy || !active}
            styles={{ root: { maxWidth: 400 } }}
            onConfirm={() => repair(key)}>
            <Button type="link" size="small" disabled={busy || !active}
              aria-label={guiText(repairLabel)} style={{ paddingInline: 0 }}>{guiText('已开启仍无法使用？修复权限')}</Button>
          </Popconfirm>}
      </div>;
    })}
    {needsRestart && <Alert type="info" showIcon message={guiText('权限已重置，请重新授权')}
      description={<Space direction="vertical" size={8}>
        <span>{guiText('请在系统设置中为 Remote AI 重新开启对应权限。完成后保存工作并重启应用，再连接远程桌面。')}</span>
        <Button disabled={busy || !active} onClick={() => void restart()}>{guiText('完成授权后重启')}</Button>
      </Space>} />}
    <Typography.Text type="secondary">{guiText('请为 Remote AI 开启权限后重新连接；若系统提示退出，请重启应用。')}</Typography.Text>
    <Typography.Text type="secondary">
      {guiText('更新或改名后无法连接，可尝试修复权限；若系统仍显示旧名称，请移除旧条目并重新添加当前应用。')}
    </Typography.Text>
    <Typography.Text type="secondary">{guiText('Mac 暂不支持传输电脑声音，连接时请保持登录并打开应用。')}</Typography.Text>
    {!!error && <Alert type="error" message={guiText(error)} />}
  </Space>;
}
