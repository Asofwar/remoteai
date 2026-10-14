import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChatMessage } from '../src/chat/ChatMessage';
import samples from '../../../shared/chat/userMessageFixture.json';
import { SelectableChatText } from '../src/chat/SelectableChatText';

function MessageTextFixture() {
  const [narrow, setNarrow] = useState(false);
  const [sweep, setSweep] = useState(false);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#f4f4f4' }}>
    <Pressable onPress={() => setNarrow(value => !value)} style={{ padding: 16 }}>
      <Text>{narrow ? '完整宽度' : '窄屏宽度'}</Text>
    </Pressable>
    <Pressable onPress={() => setSweep(value => !value)} style={{ padding: 16 }}><Text>Font sweep</Text></Pressable>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
      <View testID="overflow-bubble" style={{ backgroundColor: '#e7f5f4', padding: 19 }}>
        <Text>Layout recovery</Text>
        <Text testID="overflow-reference" style={{ fontSize: 14, lineHeight: 25 }}>
          {'第一行\n末尾不能被裁掉'}
        </Text>
        {/* Simulate Fabric allocating one line while Android actually lays out two. */}
        <SelectableChatText testID="overflow-recovery" style={{ height: 25, fontSize: 14, lineHeight: 25 }}>
          {'第一行\n末尾不能被裁掉'}
        </SelectableChatText>
      </View>
      {sweep ? Array.from({ length: 49 }, (_, index) => <View key={index} style={{ alignItems: 'flex-end' }}>
        <View style={{ padding: 19, maxWidth: '90%', backgroundColor: '#e7f5f4' }}>
          <SelectableChatText style={{ fontSize: 12 + index / 8, lineHeight: 25 }}>
            {samples.reported}
          </SelectableChatText>
        </View>
      </View>) :
      <View style={{ width: narrow ? 280 : '100%', alignSelf: 'flex-end', gap: 20 }}>
        {Object.entries(samples).map(([id, text]) => <View key={id}>
          <Text>{id}</Text>
          <ChatMessage item={{ id, type: 'userMessage', text }} onOpen={() => {}} />
        </View>)}
      </View>}
    </ScrollView>
  </SafeAreaView></SafeAreaProvider>;
}

registerRootComponent(MessageTextFixture);
