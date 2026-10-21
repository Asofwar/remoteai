import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system';
import type { ProjectBrowserClient } from '../../../../shared/project-browser/protocol';
import { handleBrowserRequest, type BrowserHostMessage } from '../../../../shared/project-browser/nativeBridge';
import { projectBrowserEnglish } from '../../../../shared/i18n/projectBrowser';
import { t, useLanguage } from '../i18n';
import { useThemeColor } from '../theme/store';
import { createThemedStyles } from '../theme/styles';
import { useFilePreferences, setFileAutoSave } from '../settings/filePreferences';
import { readBrowserSession, saveBrowserSession } from './projectBrowserSessions';
import type { DocumentsSnapshot } from '../../../../shared/project-browser/documents';
import { projectBrowserHost } from './projectBrowserHost';
import { useChatFileReference } from '../../../../shared/chat/ChatFileReferences';

export function ProjectBrowser({ client, cwd, connected, active, onClose }: {
  client: ProjectBrowserClient; cwd: string; connected: boolean; active: boolean; onClose: () => void;
}) {
  const language = useLanguage();
  const color = useThemeColor();
  const styles = useStyles();
  const preferences = useFilePreferences();
  const webview = useRef<WebView>(null);
  const reference = useChatFileReference();
  const focusAfterClose = useRef<(() => void) | null>(null);
  const transfer = useMemo(() => new AbortController(), [client, cwd]);
  const host = useMemo(() => ({ ...projectBrowserHost(client, transfer.signal),
    reference: async (entry: Parameters<typeof reference>[0]) => { focusAfterClose.current = reference(entry); },
  }), [client, transfer, reference]);
  useEffect(() => () => transfer.abort(), [transfer]);
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const source = useMemo(() => ({ html }), [html]);
  const emit = (message: BrowserHostMessage) =>
    webview.current?.injectJavaScript(`window.projectBrowserMessage?.(${JSON.stringify(message)}); true;`);
  const close = () => { if (ready) emit({ type: 'close' }); else onClose(); };
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const asset = Asset.fromModule(require('../../assets/project-browser.html'));
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('Missing browser asset');
      const content = await readAsStringAsync(asset.localUri);
      if (!cancelled) setHtml(content);
    };
    void load().catch(() => { if (!cancelled) setError('文件浏览器未能加载，请重新打开。'); });
    return () => { cancelled = true; };
  }, []);
  const update = () => emit({ type: 'settings', cwd, connected: connected && active && preferences.ready,
    autoSaveDelay: preferences.delay, snapshot: readBrowserSession(client, cwd),
    labels: Object.fromEntries(Object.keys(projectBrowserEnglish).map(text => [text, t(text)])),
    theme: { '--ink': color('#202c29', 'ink'), '--muted': color('#718078', 'muted'),
      '--panel': color('#fff', 'surface'), '--bg': color('#f5f8f6', 'canvas'),
      '--line': color('#dfe5e1', 'border'), '--green': color('#138475', 'accent'),
      '--browser-on-accent': color('#fff', 'canvas') } });
  useEffect(() => { if (ready) update(); }, [ready, connected, active, cwd, language, color, preferences]);
  // Backgrounding the app must not unmount the WebView and discard its unsaved document.
  return <Modal visible animationType="slide" onRequestClose={close}
    supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <SafeAreaProvider><SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Ionicons name="folder-open-outline" size={21} color={color('#202c29', 'ink')} />
          <View style={styles.heading}><Text style={styles.title}>{t('文件浏览')}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{cwd.split(/[\\/]/).filter(Boolean).at(-1)}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('关闭文件浏览器')}
            style={styles.close} onPress={close}><Ionicons name="close" size={24} color={color('#202c29', 'ink')} /></Pressable>
        </View>
        {!html && !error && <ActivityIndicator style={styles.fill} color={color('#138475', 'accent')} />}
        {html && <WebView ref={webview} source={source} style={styles.screen} javaScriptEnabled
          scrollEnabled={false} bounces={false} originWhitelist={['about:blank']}
          allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
          sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false} keyboardDisplayRequiresUserAction
          onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
          onMessage={({ nativeEvent }) => {
            let message: unknown;
            try { message = JSON.parse(nativeEvent.data); } catch { return; }
            if (!message || typeof message !== 'object' || !('type' in message)) return;
            if (message.type === 'ready') { setReady(true); update(); return; }
            if (message.type === 'closed') {
              if ('snapshot' in message && message.snapshot && typeof message.snapshot === 'object'
                && 'tabs' in message.snapshot && Array.isArray(message.snapshot.tabs)) {
                saveBrowserSession(client, cwd, message.snapshot as DocumentsSnapshot);
              }
              onClose();
              if (focusAfterClose.current) requestAnimationFrame(focusAfterClose.current);
              return;
            }
            if (message.type === 'preferences' && 'delay' in message && typeof message.delay === 'number') {
              void setFileAutoSave(message.delay).then(saved => {
                if (!saved) setError('未能保存设置，请重试。');
              });
              return;
            }
            void handleBrowserRequest(nativeEvent.data, { client, cwd, host, connected: connected && active })
              .then(reply => { if (reply) emit(reply); });
          }}
          onError={() => { setReady(false); setError('文件浏览器未能加载，请重新打开。'); }} />}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text>}
      </KeyboardAvoidingView>
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const useStyles = createThemedStyles(color => ({
  screen: { flex: 1, backgroundColor: color('#fff', 'surface') },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 60,
    borderBottomWidth: 1, borderBottomColor: color('#dfe5e1', 'border') },
  heading: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '600', color: color('#202c29', 'ink') },
  subtitle: { fontSize: 12, color: color('#718078', 'muted') },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: color('#c44545', 'danger'), padding: 16 },
}));
