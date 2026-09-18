import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';

export function ChatReconnectButton({ retryAt, onClick }: { retryAt: number | null; onClick: () => void }) {
  useLanguage();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now) / 1000));
  return <button type="button" className="chat-connection chat-reconnect" aria-label={t("立即连接")} onClick={onClick}>
    {t("立即连接")}{seconds === null ? '' : t("（{value1}秒）", { value1: seconds })}
  </button>;
}
