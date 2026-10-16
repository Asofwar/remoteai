import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { setInterfaceLanguage } from '../../../shared/i18n/interfaceLanguage';
import type { ThreadGoal } from '../../desktop/src/pages/codexGui/goalTypes';
import { ComposerGoal } from '../src/chat/ComposerGoal';
import { useStyles } from '../src/chat/styles';

setInterfaceLanguage('zh');
const objective = '完成聊天界面测试，确保手机窄屏上的目标文字完整换行，点击后可以查看全部内容。\n'
  + '同时验证键盘展开时的点击，以及移除目标按钮。';
const goal: ThreadGoal = { threadId: 'fixture', objective, status: 'active', tokenBudget: null,
  tokensUsed: 100, timeUsedSeconds: 60, createdAt: 1, updatedAt: 1 };

function GoalFixture() {
  const styles = useStyles();
  const [narrow, setNarrow] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [draftMode, setDraftMode] = useState(false);
  const [draft, setDraft] = useState('');
  return <SafeAreaProvider><SafeAreaView style={[styles.page, { justifyContent: 'flex-end' }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="切换窄屏" onPress={() => setNarrow(value => !value)}
      style={styles.button}><Text>切换窄屏</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="切换草稿"
      onPress={() => { setRemoved(false); setDraftMode(value => !value); }} style={styles.button}>
      <Text>切换草稿</Text></Pressable>
    <Text accessibilityLabel="移除次数">{removed ? '1' : '0'}</Text>
    <View style={[styles.composerDock, { width: narrow ? 280 : '100%', alignSelf: 'center' }]}>
      <View style={styles.composer}><View style={styles.composerField}>
        <ScrollView style={styles.composerContent} contentContainerStyle={styles.composerContentInner}
          keyboardShouldPersistTaps="always">
          {!removed && <ComposerGoal key={String(draftMode)} goal={draftMode ? null : goal} draft={draft}
            disabled={false} remove={() => setRemoved(true)} />}
          <TextInput accessibilityLabel="聊天消息" value={draft} onChangeText={setDraft}
            style={styles.input} multiline placeholder="描述想完成的目标…" />
        </ScrollView>
        <View style={styles.composerActions}><Text>+</Text><Text>GPT-6-Astra · 极高</Text><Text>↑</Text></View>
      </View></View>
    </View>
  </SafeAreaView></SafeAreaProvider>;
}

registerRootComponent(GoalFixture);
