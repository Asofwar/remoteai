import * as Clipboard from 'expo-clipboard';
import { Toast } from '../components/AppToast';

export async function copyAccountValue(label: string, value: string) {
  if (!value) return;
  try {
    await Clipboard.setStringAsync(value);
    Toast.success(`已复制${label}`);
  } catch {
    Toast.fail('复制失败，请重试');
  }
}
