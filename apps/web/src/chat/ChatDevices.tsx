import { t, useLanguage } from '../i18n';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import type { ChatComputer } from '../../../../shared/remote-chat/devices';
import { useState } from 'react';
import { ComputerSearchBar, type ComputerListRefresh } from '../../../../shared/remote-chat/ComputerSearchBar';
import { useDesktopLayout } from '../useDesktopLayout';

export function ChatDevices({ devices, choose, chooseLocal, onClose, refresh }: {
  devices: ChatComputer[]; choose: (id: string) => void; onClose: () => void; chooseLocal?: () => void;
  refresh?: ComputerListRefresh;
}) {
  useLanguage();
  const desktop = useDesktopLayout();
  const [query, setQuery] = useState('');
  const keyword = desktop ? query.trim().toLocaleLowerCase() : '';
  const matches = devices.filter(device => device.name.toLocaleLowerCase().includes(keyword));
  const showLocal = chooseLocal && t('本机').includes(keyword);
  return <AdaptiveSheet open title={t("选择电脑")} width={400} onClose={onClose}>
    <div className="chat-settings">
      {showLocal && <button type="button" className="chat-setting-entry" onClick={chooseLocal}>
        <strong>本机</strong></button>}
      {matches.map((device) => <button type="button" key={device.deviceId} className="chat-setting-entry"
        disabled={!device.online} onClick={() => choose(device.deviceId)}>
        <strong>{device.name}</strong><span>{device.online ? t("在线") : t("离线")}</span>
      </button>)}
      {!devices.length && <p className="chat-muted">{t("在电脑上打开 Remote AI 并登录同一账号，即可开始聊天。")}</p>}
      {!!keyword && !showLocal && !matches.length
        && <p className="chat-muted">{t('没有找到匹配的主机')}</p>}
      {desktop && refresh?.error && <p className="chat-error" role="alert">{refresh.error}</p>}
      {desktop && <ComputerSearchBar query={query} onQueryChange={setQuery}
        searchLabel={t('搜索主机')} refreshLabel={t('刷新主机列表')} refresh={refresh} />}
    </div>
  </AdaptiveSheet>;
}
