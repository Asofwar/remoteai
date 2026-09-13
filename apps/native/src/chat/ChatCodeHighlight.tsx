import { memo, useMemo } from 'react';
import { Text } from 'react-native';
import { highlightCode } from './codeHighlight';

export { fileLanguage } from './codeHighlight';

/** Render inside a selectable monospace Text so selection and copying keep the original code. */
export const HighlightedCode = memo(function HighlightedCode({ text, language }: { text: string; language: string }) {
  const spans = useMemo(() => highlightCode(text, language), [text, language]);
  return <>{spans.map((span, index) => span.color
    ? <Text key={index} style={{ color: span.color }}>{span.text}</Text> : span.text)}</>;
});
