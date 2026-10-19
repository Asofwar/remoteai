import { useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { t } from '../../i18n';
import { useStyles } from '../styles';
import { MappingPreviewActivity } from './MappingPreviewActivity';
import { PREVIEW_NETWORK_SCRIPT } from './previewNetworkActivity';
import { usePreviewActivity } from './usePreviewActivity';

export function MappingPreview({ port, close }: { port: number; close: () => void }) {
  const styles = useStyles();
  const webview = useRef<WebView>(null);
  const [error, setError] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const activity = usePreviewActivity();
  const url = `http://127.0.0.1:${port}`;
  return <Modal visible animationType="slide" onRequestClose={close}
    supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <SafeAreaProvider><SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={close} style={styles.button}>
          <Text style={styles.buttonText}>{t('关闭')}</Text></Pressable>
        <Text selectable numberOfLines={1} style={[styles.subtitle, { flex: 1, minWidth: 0 }]}>{url}</Text>
        <MappingPreviewActivity active={activity.active} />
      </View>
      <View style={[styles.row, { paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' }]}>
        <Pressable accessibilityRole="button" onPress={() => { activity.onLoadStart(); webview.current?.goBack(); }}
          disabled={!canGoBack} style={[styles.button, !canGoBack && styles.disabled]}>
          <Text style={styles.buttonText}>{t('返回')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => {
          setError(''); activity.onLoadStart(); webview.current?.reload();
        }}
          style={styles.button}><Text style={styles.buttonText}>{t('刷新')}</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.button}
          onPress={() => { void Linking.openURL(url).catch(() => setError(t('无法打开浏览器，请重试。'))); }}>
          <Text style={styles.buttonText}>{t('在浏览器中打开')}</Text></Pressable>
      </View>
      {Platform.OS === 'ios' && <Text style={[styles.subtitle, { paddingHorizontal: 16, maxWidth: 400 }]}>
        {t('切到其他应用后，映射可能中断，建议在此预览。')}</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <WebView ref={webview} source={{ uri: url }} style={styles.fill} incognito
        originWhitelist={['http://*', 'https://*']} allowFileAccess={false}
        allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
        sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false}
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false}
        // Android enforces this through patch-webview-permissions.cjs, including after redirects.
        geolocationEnabled={false} mediaCapturePermissionGrantType="deny"
        injectedJavaScriptBeforeContentLoaded={PREVIEW_NETWORK_SCRIPT}
        injectedJavaScript={PREVIEW_NETWORK_SCRIPT}
        onMessage={activity.onMessage} onLoadStart={activity.onLoadStart} onLoadEnd={activity.onLoadEnd}
        onShouldStartLoadWithRequest={request => /^https?:\/\//i.test(request.url)}
        onNavigationStateChange={state => setCanGoBack(state.canGoBack)}
        renderError={() => <View style={styles.empty}>
          <Text style={[styles.subtitle, { maxWidth: 400 }]}>
            {t('网页未能加载，请确认服务已启动后刷新。')}</Text></View>}
        onError={() => { activity.reset(); setError(t('网页未能加载，请确认服务已启动后刷新。')); }} />
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}
