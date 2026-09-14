import { useEffect } from 'react';
import { ChatHost } from './host';
import { retainGuiSession } from '../pages/codexGui/session';
import { mobileConnection } from './mobileConnection';

export function useChatHost() {
  useEffect(() => {
    const releaseSession = retainGuiSession();
    const host = new ChatHost(mobileConnection.setConnected);
    return () => { host.close(); releaseSession(); };
  }, []);
}

export function RemoteChatHost() { useChatHost(); return null; }
