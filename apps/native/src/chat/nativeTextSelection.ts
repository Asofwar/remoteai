import { NativeModules } from 'react-native';

interface SelectionBridge {
  configure: (tag: number, enabled: boolean, trailingControls: number) => void;
  detach: (tag: number) => void;
  dismiss: () => void;
}

export const nativeTextSelection = NativeModules.ChatTextSelection as SelectionBridge | undefined;
