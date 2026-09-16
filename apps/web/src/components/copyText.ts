import { Toast } from 'antd-mobile';

export async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    Toast.show({ icon: 'success', content: `${label}已复制` });
  } catch {
    Toast.show({ icon: 'fail', content: '复制失败，请重试' });
  }
}
