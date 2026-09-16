import { useEffect, useState } from 'react';

export function ChatReconnectButton({ retryAt, onClick }: { retryAt: number | null; onClick: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now) / 1000));
  return <button type="button" className="chat-connection chat-reconnect" aria-label="立即连接" onClick={onClick}>
    立即连接{seconds === null ? '' : `（${seconds}秒）`}
  </button>;
}
