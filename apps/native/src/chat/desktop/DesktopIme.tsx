import { useEffect, useRef } from 'react';
import { t, useLanguage } from '../../i18n';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseDesktopImeMessage } from '../../../../../shared/remote-desktop/ime';
import type { DesktopInput } from '../../../../../shared/remote-desktop/protocol';
import { desktopImeHtml } from './desktopImeHtml.generated';
import { focusDesktopIme } from './focusDesktopIme';

// WebView composition events distinguish candidate text from committed Chinese/Japanese input.
const source = { html: desktopImeHtml };

export function DesktopIme({ input, focusRequest }: {
  input: (event: DesktopInput) => void; focusRequest: number;
}) {
  useLanguage();
  const webview = useRef<WebView>(null);
  const container = useRef<View>(null);
  const labels = `(() => { const field = document.querySelector('textarea'); if (!field) return;
    field.setAttribute('aria-label', ${JSON.stringify(t('发送到电脑的文字'))}); })(); true;`;
  const focus = () => {
    webview.current?.requestFocus();
    webview.current?.injectJavaScript("document.querySelector('textarea').blur(); "
      + "document.querySelector('textarea').focus(); window.ReactNativeWebView.postMessage('focus'); true;");
  };
  useEffect(() => { webview.current?.injectJavaScript(labels); }, [labels]);
  useEffect(() => { if (focusRequest > 0) focus(); }, [focusRequest]);
  // A mounted, focusable WebView receives IME composition without taking space above the keyboard.
  return <View ref={container} collapsable={false} pointerEvents="none"
    style={{ position: 'absolute', left: 0, bottom: 0, width: 1, height: 1, opacity: 0 }}>
    <WebView ref={webview} source={source}
      style={{ backgroundColor: 'transparent' }}
      originWhitelist={['about:blank']} scrollEnabled={false} bounces={false}
      allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false} keyboardDisplayRequiresUserAction={false}
      hideKeyboardAccessoryView onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
      onLoadEnd={() => {
        webview.current?.injectJavaScript(labels);
        focus();
      }}
      onMessage={({ nativeEvent }) => {
        if (nativeEvent.data === 'focus') { focusDesktopIme(container.current); return; }
        const event = parseDesktopImeMessage(nativeEvent.data);
        if (event) input(event);
      }} />
  </View>;
}
