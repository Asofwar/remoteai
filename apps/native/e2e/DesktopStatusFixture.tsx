import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { DesktopClient } from '../../../shared/remote-desktop/protocol';
import { RemoteDesktop } from '../src/chat/desktop/RemoteDesktop';

const connectingClient: DesktopClient = {
  open: () => new Promise(() => undefined),
  signal: async () => ({ candidates: [] }),
  settings: async () => undefined,
  close: async () => undefined,
};
const permissionClient: DesktopClient = {
  ...connectingClient,
  open: async () => { throw new Error('请在 Mac 的远程设置中开启屏幕录制权限，然后重新连接。'); },
  permissionStatus: async () => ({ required: 'screenRecording' }),
};

function DesktopStatusFixture() {
  const [fonts] = useFonts({ ...Ionicons.font, ...MaterialCommunityIcons.font });
  const [scenario, setScenario] = useState<'connecting' | 'permission' | null>(null);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1 }}>
    <View style={{ padding: 24, gap: 24 }}>
      <Text testID="status-line-reference"
        style={{ fontSize: 14, lineHeight: 22, includeFontPadding: true, paddingVertical: 2 }}>重新连接</Text>
      <Pressable accessibilityRole="button" onPress={() => setScenario('connecting')}>
        <Text>Connecting status</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setScenario('permission')}>
        <Text>Permission status</Text>
      </Pressable>
    </View>
    {fonts && scenario && <RemoteDesktop active
      client={scenario === 'connecting' ? connectingClient : permissionClient} close={() => setScenario(null)} />}
  </SafeAreaView></SafeAreaProvider>;
}

registerRootComponent(DesktopStatusFixture);
