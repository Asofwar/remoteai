import { NativeModules } from 'react-native';
import { subscribeInterfaceLanguage } from '../../../../shared/i18n/interfaceLanguage';
import { t } from '../i18n';

export interface SelectionLabels { copy: string; selectAll: string; quote: string }

interface SelectionBridge {
  longPressTimeoutMs?: number;
  configure: (tag: number, enabled: boolean, trailingControls: number) => void;
  /** Missing in older native builds, which keep their built-in Chinese toolbar titles. */
  setLabels?: (labels: SelectionLabels) => void;
  detach: (tag: number) => void;
  dismiss: () => void;
}

export const nativeTextSelection = NativeModules.ChatTextSelection as SelectionBridge | undefined;

export const selectionLabels = (): SelectionLabels => ({ copy: t('复制'), selectAll: t('全选'), quote: t('引用') });

/** The Android selection toolbar is native, so it receives its titles again after each language change. */
export function syncSelectionLabels(bridge: SelectionBridge | undefined = nativeTextSelection): () => void {
  if (typeof bridge?.setLabels !== 'function') return () => undefined;
  const update = () => bridge.setLabels?.(selectionLabels());
  update();
  return subscribeInterfaceLanguage(update);
}

syncSelectionLabels();
