import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { setInterfaceLanguage } from '../../../shared/i18n/interfaceLanguage';
import { ComposerSuggestion } from '../src/chat/ComposerSuggestion';
import { useStyles } from '../src/chat/styles';
import suggestions from '../../../shared/chat/promptSuggestionFixture.json';

setInterfaceLanguage('zh');
const samples = Object.values(suggestions);

function ComposerSuggestionFixture() {
  const styles = useStyles();
  const [narrow, setNarrow] = useState(false);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const text = samples[index];
  return <SafeAreaProvider><SafeAreaView style={[styles.page, { justifyContent: 'flex-end' }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="切换窄屏" style={styles.button}
      onPress={() => setNarrow(value => !value)}><Text>切换窄屏</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="下一条预测" style={styles.button}
      onPress={() => { setIndex(value => (value + 1) % samples.length); setDraft(''); }}>
      <Text>下一条预测</Text>
    </Pressable>
    <Text accessibilityLabel="完整预测" style={{ padding: 16 }}>{text}</Text>
    <View style={[styles.composerDock, { width: narrow ? 280 : '100%', alignSelf: 'center' }]}>
      <View style={styles.composer}><View style={styles.composerField}>
        <ScrollView style={styles.composerContent} contentContainerStyle={styles.composerContentInner}
          keyboardShouldPersistTaps="always" nestedScrollEnabled>
          {!draft && <ComposerSuggestion text={text} accept={() => setDraft(text)} />}
          <TextInput accessibilityLabel="聊天消息" value={draft} onChangeText={setDraft}
            style={styles.input} multiline placeholder="% 引用文件，@ 引用对话…" />
        </ScrollView>
        <View style={styles.composerActions}>
          <Text>+</Text><Text>GPT-6-Astra · 极高</Text><Text>↑</Text>
        </View>
      </View></View>
    </View>
  </SafeAreaView></SafeAreaProvider>;
}

registerRootComponent(ComposerSuggestionFixture);
