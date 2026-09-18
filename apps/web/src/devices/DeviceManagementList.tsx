import { t, useLanguage } from '../i18n';
import { Info, Layers, RefreshCw, Smartphone } from 'lucide-react';
import type { ComponentProps } from 'react';
import { DeviceCard } from './DeviceCard';
import './styles.css';

type DeviceManagementListProps = Omit<ComponentProps<typeof DeviceCard>, 'device'> & {
  devices: ComponentProps<typeof DeviceCard>['device'][];
  refreshing: boolean;
  onRefresh: () => Promise<void>;
};

export function DeviceManagementList({ devices, refreshing, onRefresh, ...cardProps }: DeviceManagementListProps) {
  useLanguage();
  const online = devices.filter((device) => device.online).length;
  return <div className="page-body devices-page">
    <header className="devices-heading"><h1>{t("设备管理")}</h1>
      <button className="devices-refresh" type="button" disabled={refreshing} onClick={() => void onRefresh()}
        aria-label={t("刷新设备列表")} aria-busy={refreshing}>
        <RefreshCw size={23} className={refreshing ? 'spin' : ''} />
      </button>
    </header>
    <p className="devices-subtitle">{t("查看设备状态，点击卡片切换模型")}</p>
    <section className="device-overview" aria-label={t("设备统计")}>
      <div className="device-stat"><span className="device-stat-icon"><Smartphone size={28} aria-hidden /></span>
        <div><strong>{online}</strong><span><i />{t("当前在线")}</span></div></div>
      <div className="device-stat"><span className="device-stat-icon"><Layers size={28} aria-hidden /></span>
        <div><strong>{devices.length}</strong><span>{t("全部设备")}</span></div></div>
    </section>
    <h2 className="devices-list-title">{t("已登录设备")} <span>({devices.length})</span></h2>
    {devices.length ? <>
      <div className="device-grid">{devices.map((device) =>
        <DeviceCard key={device.deviceId} device={device} {...cardProps} />)}</div>
      <p className="devices-hint"><Info size={23} aria-hidden />
        <span>{t("在线设备暂不支持删除。")}<br />{t("如需移除，请先在该设备上退出登录。")}</span></p>
    </> : <div className="devices-empty"><Smartphone size={40} aria-hidden /><h3>{t("暂无设备")}</h3>
      <p>{t("在电脑上登录同一账号，设备就会自动出现在这里。")}</p></div>}
  </div>;
}
