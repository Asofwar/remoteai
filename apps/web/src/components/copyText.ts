import { t } from '../i18n';
import { Toast } from 'antd-mobile';

export async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    Toast.show({ icon: 'success', content: t("{value1}已复制", { value1: label }) });
  } catch {
    Toast.show({ icon: 'fail', content: t("复制失败，请重试") });
  }
}
