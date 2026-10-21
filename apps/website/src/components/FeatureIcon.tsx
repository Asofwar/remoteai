import {
  BarChart3,
  Boxes,
  Fingerprint,
  Globe2,
  MessageSquare,
  Monitor,
  MousePointer2,
  Palette,
  Radio,
  Terminal,
  Users,
} from 'lucide-react';

const icons = {
  'codex-gui': Terminal,
  'remote-workspace': Globe2,
  conversations: MessageSquare,
  accounts: Users,
  providers: Boxes,
  'token-usage': BarChart3,
  skills: Radio,
  'computer-use': MousePointer2,
  themes: Palette,
  'two-factor': Fingerprint,
  'floating-usage': Monitor,
};

export function FeatureIcon({ slug, size = 22 }: { slug: string; size?: number }) {
  const Icon = icons[slug as keyof typeof icons] ?? Terminal;
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />;
}
