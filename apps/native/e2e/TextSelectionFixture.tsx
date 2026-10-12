import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { ChatMessage } from '../src/chat/ChatMessage';
import { ChatMath } from '../src/chat/ChatMath';
import { ChatQuotesProvider, useChatQuotes } from '../src/chat/ChatQuotes';
import { SelectableChatText } from '../src/chat/SelectableChatText';
import { ChatDrawer, type ChatDrawerMethods } from '../src/chat/ChatDrawer';
import { useChatDrawerSwipe } from '../src/chat/useChatDrawerSwipe';

function Messages() {
  const [links, setLinks] = useState(0);
  const quotes = useChatQuotes();
  return <View style={{ gap: 24 }}>
    <Text>文字选择验证</Text>
    <ChatMessage item={{ id: 'user', type: 'userMessage', text: 'User message selection needs a long press.' }}
      onOpen={() => {}} />
    <ChatMessage item={{ id: 'answer', type: 'agentMessage',
      text: 'Long press this message to select words. Quick taps and scrolling should keep reading comfortable.\n\n'
        + '**Formatted text** also keeps its selection handles.\n\n```js\nconst selected = true;\n```' }}
      onOpen={() => {}} />
    <SelectableChatText style={{ fontSize: 18 }}>
      <Text onPress={() => setLinks(count => count + 1)}>Open inline link</Text>
    </SelectableChatText>
    <Text>Links opened: {links}</Text>
    <Text>Quotes: {quotes?.quotes.map(quote => quote.text).join(' | ')}</Text>
    <ChatMath markup="<span>Formula selection also requires a long press.</span>" />
    <Text>Blank space dismisses selection</Text>
    <View style={{ height: 800 }} />
    <Text>End of scroll</Text>
  </View>;
}

function TextSelectionFixture() {
  const [fonts] = useFonts(Ionicons.font);
  const [open, setOpen] = useState(false);
  const drawer = useRef<ChatDrawerMethods>(null);
  const openDrawer = () => { setOpen(true); drawer.current?.openDrawer(); };
  const swipe = useChatDrawerSwipe(!open, openDrawer);
  if (!fonts) return null;
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#f4f4f4' }}>
    <ChatQuotesProvider scope="selection-test" active enabled>
      <ChatDrawer ref={drawer} enabled onOpen={() => setOpen(true)} onMoving={() => setOpen(true)}
        onClose={() => setOpen(false)} navigation={<View style={{ padding: 24 }}>
          <Text>Conversation list</Text>
          <Pressable onPress={() => drawer.current?.closeDrawer()}><Text>Close conversation list</Text></Pressable>
        </View>}>
        <View style={{ flex: 1 }} {...swipe}>
          <Pressable onPress={openDrawer}><Text>Open conversation list</Text></Pressable>
          <ScrollView contentContainerStyle={{ padding: 20 }}><Messages /></ScrollView>
        </View>
      </ChatDrawer>
    </ChatQuotesProvider>
  </SafeAreaView></SafeAreaProvider>;
}

registerRootComponent(TextSelectionFixture);
