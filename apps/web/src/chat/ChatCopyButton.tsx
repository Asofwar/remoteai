import { t, useLanguage } from '../i18n';
import { Copy } from 'lucide-react';
import { copyText } from '../components/copyText';

export function ChatCopyButton({ text, label = t("复制") }: { text: string; label?: string }) {
  useLanguage();
  return <button type="button" className="chat-text-action" aria-label={label}
    onClick={() => void copyText(label.replace(/^(复制|Copy\s*)/, '') || t("内容"), text)}>
    <Copy size={15} /><span>{label}</span>
  </button>;
}
