import { t, useLanguage } from '../i18n';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { QrCode } from 'lucide-react';
import { normalizeTotpSecret, parseOtpAuthUri } from '../totp';
import type { TotpEntry } from '../types';
import { AdaptiveSheet } from '../components/AdaptiveSheet';

type Draft = Omit<TotpEntry, 'id' | 'createdAt' | 'updatedAt'>;
const EMPTY_DRAFT: Draft = { issuer: '', accountName: '', secret: '', algorithm: 'SHA1', digits: 6, period: 30 };

async function scanQrFile(file: File) {
  const detectorType = (window as unknown as {
    BarcodeDetector?: new (options: { formats: string[] }) => {
      detect(source: ImageBitmap): Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;
  if (!detectorType) throw new Error(t("当前浏览器不支持二维码识别，请手动粘贴密钥"));
  const bitmap = await createImageBitmap(file);
  try {
    const values = await new detectorType({ formats: ['qr_code'] }).detect(bitmap);
    const value = values[0]?.rawValue;
    if (!value) throw new Error(t("没有识别到有效的二维码"));
    return parseOtpAuthUri(value);
  } finally { bitmap.close(); }
}

export function TotpForm({ entry, scanFirst, onSave, onClose }: {
  entry: TotpEntry | null; scanFirst: boolean; onSave: (draft: Draft, id?: string) => void; onClose: () => void;
}) {
  useLanguage();
  const [draft, setDraft] = useState<Draft>(entry ?? EMPTY_DRAFT);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = () => {
    try {
      const parsed = draft.secret.trim().toLowerCase().startsWith('otpauth://')
        ? parseOtpAuthUri(draft.secret) : { ...draft, issuer: draft.issuer.trim(),
          accountName: draft.accountName.trim(), secret: normalizeTotpSecret(draft.secret) };
      if (!parsed.issuer) throw new Error(t("请输入服务名称"));
      onSave(parsed, entry?.id);
      Toast.show({ icon: 'success', content: t("2FA 密钥已保存") });
      onClose();
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("2FA 密钥无效") });
    }
  };
  const importQr = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setScanning(true);
    try { setDraft(await scanQrFile(file)); }
    catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("二维码识别失败") });
    } finally { setScanning(false); }
  };
  return <AdaptiveSheet open title={entry ? t("编辑 2FA 密钥") : t("添加 2FA 密钥")}
    subtitle={t("输入服务名称与密钥，或选择二维码图片。")} onClose={onClose}>
    {scanFirst && <p className="settings-hint">{t("选择相册中的二维码，也可以拍摄二维码图片。")}</p>}
    <Button block loading={scanning} onClick={() => fileRef.current?.click()}><QrCode size={18} />{t("选择二维码图片")}</Button>
    <input ref={fileRef} hidden type="file" accept="image/*" onChange={event => void importQr(event)} />
    <Form layout="vertical" footer={<Button block color="primary" disabled={scanning} onClick={save}>{t("保存密钥")}</Button>}>
      <Form.Item label={t("服务名称")}><Input aria-label={t("服务名称")} value={draft.issuer} placeholder={t("例如 OpenAI")}
        onChange={value => setDraft(current => ({ ...current, issuer: value }))} /></Form.Item>
      <Form.Item label={t("账号名称")}><Input aria-label={t("账号名称")} value={draft.accountName} placeholder="name@example.com"
        onChange={value => setDraft(current => ({ ...current, accountName: value }))} /></Form.Item>
      <Form.Item label={t("2FA 密钥")}><Input aria-label={t("2FA 密钥")} value={draft.secret} autoComplete="off"
        placeholder={t("粘贴密钥或验证码链接")} onChange={value => setDraft(current => ({ ...current, secret: value }))} />
      </Form.Item>
    </Form>
  </AdaptiveSheet>;
}
