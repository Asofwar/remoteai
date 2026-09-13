import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../components/BottomSheet';
import { pendingQuestions } from '../../../../shared/remote-chat/client/asyncQuestions';
import type { Item, Thread } from './types';
import { palette, styles } from './styles';

interface Props {
  thread: Thread | null; disabled: boolean; error: string;
  answer: (item: Item, answers: string[]) => Promise<boolean>;
}
interface QuestionProps {
  question: NonNullable<Item['questions']>[number]; value: string; disabled: boolean;
  update: (value: string) => void; submit: () => void;
}

function QuestionField({ question, value, disabled, update, submit }: QuestionProps) {
  return <View style={questionStyles.question}>
    <Text style={styles.messageText}>{question.title}</Text>
    {question.options?.map((option, index) => <Pressable key={index} accessibilityRole="radio"
      disabled={disabled} accessibilityState={{ checked: value === option, disabled }}
      style={questionStyles.option} onPress={() => update(option)}>
      <Ionicons name={value === option ? 'radio-button-on' : 'radio-button-off'} size={18}
        color={value === option ? palette.green : palette.muted} />
      <Text style={[styles.messageText, styles.fill]}>{option}</Text>
    </Pressable>)}
    <TextInput accessibilityLabel={question.title} placeholder="输入你的回答" placeholderTextColor={palette.muted}
      style={[styles.questionInput, questionStyles.input, disabled && styles.disabled]}
      multiline editable={!disabled} value={value} onChangeText={update} returnKeyType="send"
      submitBehavior="submit" onSubmitEditing={submit} />
  </View>;
}

function QuestionCard({ item, disabled, error, answer }: Omit<Props, 'thread'> & { item: Item }) {
  const questions = item.questions ?? [];
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState(() => questions.map((question) => question.options?.[0] ?? ''));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current || disabled || answers.some((value) => !value.trim())) return;
    submitting.current = true; setBusy(true); setFailure('');
    try {
      if (await answer(item, answers)) setOpen(false);
      else setFailure('回答尚未确认，请查看发送进度或稍后重试。');
    } catch { setFailure('回答发送失败，请重试。'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`回答补充问题：${questions[0]?.title ?? ''}`}
      style={questionStyles.entry} onPress={() => setOpen(true)}>
      <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.green} />
      <View style={styles.fill}><Text style={styles.title}>需要你的补充</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{questions[0]?.title}</Text></View>
      <Text style={styles.buttonText}>回答</Text>
      <Ionicons name="chevron-forward" size={15} color={palette.muted} />
    </Pressable>
    <BottomSheet visible={open} tall title="需要你的补充" onClose={() => setOpen(false)}
      dismissible={!busy} dragFromHeaderOnly actions={[{ label: '提交回答', tone: 'primary', loading: busy,
        disabled: disabled || answers.some((value) => !value.trim()), onPress: submit }]}>
      <ScrollView style={questionStyles.scroll} contentContainerStyle={questionStyles.content}
        keyboardShouldPersistTaps="handled">
        {questions.map((question, index) => <QuestionField key={index} question={question}
          value={answers[index] ?? ''} disabled={disabled || busy} submit={() => { void submit(); }}
          update={(value) => setAnswers((previous) => previous.map((entry, position) =>
            position === index ? value : entry))} />)}
        {!!(error || failure) && <Text accessibilityRole="alert" style={styles.error}>{error || failure}</Text>}
      </ScrollView>
    </BottomSheet>
  </>;
}

export function ChatAsyncQuestions({ thread, ...props }: Props) {
  const questions = pendingQuestions(thread);
  if (!questions.length) return null;
  return <ScrollView style={questionStyles.entries} contentContainerStyle={questionStyles.entryContent}
    keyboardShouldPersistTaps="handled">
    {questions.map((item) => <QuestionCard key={`${thread?.id}:${item.id}`} item={item} {...props} />)}
  </ScrollView>;
}

const questionStyles = StyleSheet.create({
  entries: { flexGrow: 0, maxHeight: 180 },
  entryContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: '#fff' },
  scroll: { flexShrink: 1 },
  content: { gap: 20, paddingBottom: 20, maxWidth: 400, width: '100%', alignSelf: 'center' },
  question: { gap: 12 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  input: { minHeight: 42, maxHeight: 120, textAlignVertical: 'top' },
});
