import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { getStringAsync } from 'expo-clipboard';
import reported from '../../../shared/chat/toolDetailsFixture.json';
import { ChatToolDetails } from '../src/chat/ChatToolDetails';
import { ChatQuotesProvider } from '../src/chat/ChatQuotes';
import { TOOL_OUTPUT_PAGE_CHARACTERS } from '../src/chat/toolOutput';
import { updateThemeMode, useThemeMode } from '../src/theme/store';

const outputLine = 'Tool output line.\n';
const longText = outputLine.repeat(Math.ceil(TOOL_OUTPUT_PAGE_CHARACTERS / outputLine.length)) + '\nOUTPUT_END';
const samples = {
  reported,
  long: { ...reported, result: { content: [{ type: 'text', text: longText }] } },
  literal: { ...reported, result: '<div>literal output</div>\n**keep these characters**' },
};

function ToolDetailsFixture() {
  const [fonts] = useFonts({ ...Ionicons.font, ...Feather.font });
  const [sample, setSample] = useState<keyof typeof samples>('reported');
  const [open, setOpen] = useState(true);
  const [clipboard, setClipboard] = useState('');
  const theme = useThemeMode();
  if (!fonts) return null;
  const color = theme === 'dark' ? '#e8eee9' : '#17211b';
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1,
    backgroundColor: theme === 'dark' ? '#121513' : '#f4f4f4' }}>
    <View style={{ padding: 20, gap: 20 }}>
      <Text style={{ color }}>工具详情真机验证</Text>
      {(Object.keys(samples) as (keyof typeof samples)[]).map(key =>
        <Pressable key={key} onPress={() => { setSample(key); setOpen(true); }}>
          <Text style={{ color }}>{key}</Text>
        </Pressable>)}
      <Pressable onPress={() => updateThemeMode(theme === 'dark' ? 'light' : 'dark')}>
        <Text style={{ color }}>切换主题</Text>
      </Pressable>
      <Pressable onPress={() => void getStringAsync().then(setClipboard)}>
        <Text style={{ color }}>检查复制内容</Text>
      </Pressable>
      <Text testID="copied-output" style={{ color }}>{clipboard}</Text>
    </View>
    <ChatQuotesProvider scope="tool-details-fixture" active enabled>
      {open && <ChatToolDetails item={samples[sample]} onClose={() => setOpen(false)}
        onBack={() => setOpen(false)} />}
    </ChatQuotesProvider>
  </SafeAreaView></SafeAreaProvider>;
}

registerRootComponent(ToolDetailsFixture);
