import { useState } from 'react';
import type { WebViewMessageEvent } from 'react-native-webview';
import { PREVIEW_NETWORK_BUSY, PREVIEW_NETWORK_IDLE } from './previewNetworkActivity';

export function usePreviewActivity() {
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const onLoadStart = () => { setLoading(true); setRequesting(false); };
  const onLoadEnd = () => setLoading(false);
  const reset = () => { setLoading(false); setRequesting(false); };
  const onMessage = ({ nativeEvent: { data } }: WebViewMessageEvent) => {
    if (data === PREVIEW_NETWORK_BUSY) setRequesting(true);
    else if (data === PREVIEW_NETWORK_IDLE) setRequesting(false);
  };
  return { active: loading || requesting, onLoadStart, onLoadEnd, onMessage, reset };
}
