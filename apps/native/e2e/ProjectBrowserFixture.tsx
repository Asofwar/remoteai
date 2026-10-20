import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { setInterfaceLanguage } from '../../../shared/i18n/interfaceLanguage';
import { createProjectBrowserClient } from '../../../shared/project-browser/protocol';
import { browserRequest, browserRoot } from '../../desktop/e2e/project-browser-fixture';
import { ProjectBrowser } from '../src/chat/ProjectBrowser';

setInterfaceLanguage('zh');
const client = createProjectBrowserClient(browserRequest);

function Fixture() {
  const [open, setOpen] = useState(true);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
    <View style={{ padding: 24 }}>
      <Text>文件浏览测试</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ padding: 16 }}>
        <Text>打开文件浏览</Text>
      </Pressable>
    </View>
    {open && <ProjectBrowser client={client} cwd={browserRoot} connected active onClose={() => setOpen(false)} />}
  </SafeAreaView></SafeAreaProvider>;
}
registerRootComponent(Fixture);
