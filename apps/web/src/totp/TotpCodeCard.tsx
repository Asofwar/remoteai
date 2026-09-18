import { t, useLanguage } from '../i18n';
import { Dropdown } from 'antd';
import { Copy, Github, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { TotpEntry } from '../types';
import { copyText } from '../components/copyText';

export function TotpCodeCard({ entry, code, now, onEdit, onDelete }: {
  entry: TotpEntry; code: string; now: number; onEdit: () => void; onDelete: () => void;
}) {
  useLanguage();
  const seconds = entry.period - Math.floor(now / 1000) % entry.period;
  const split = code.length / 2;
  const formatted = code ? `${code.slice(0, split)} ${code.slice(split)}` : t("暂不可用");
  const copy = () => { if (code) void copyText(t("验证码"), code); };
  return <article className="verification-card">
    <header><span className={`verification-service ${entry.issuer.toLowerCase() === 'github' ? 'github' : ''}`}>
      {entry.issuer.toLowerCase() === 'github' ? <Github size={30} />
        : Array.from(entry.issuer.trim())[0]?.toLocaleUpperCase() ?? '?'}</span>
      <div><h2>{entry.issuer || t("未命名")}</h2><p>{entry.accountName}</p></div>
      <Dropdown trigger={['click']} menu={{ items: [
        { key: 'edit', label: t("编辑密钥"), icon: <Pencil size={16} />, onClick: onEdit },
        { key: 'delete', label: t("删除密钥"), icon: <Trash2 size={16} />, danger: true, onClick: onDelete },
      ] }}><button type="button" className="icon-button" aria-label={t("管理 {value1} 的 2FA 密钥", { value1: entry.issuer })}>
        <MoreHorizontal size={21} /></button></Dropdown></header>
    <div className="verification-code-body">
      <button className="verification-code" type="button" onClick={copy} disabled={!code}
        aria-label={t("复制 {value1} 验证码", { value1: entry.issuer })}>
        <span><strong>{formatted}</strong><small>{seconds}  {t("秒")}</small></span>
        <span className="verification-progress"><i style={{ width: `${seconds / entry.period * 100}%` }} /></span>
      </button>
      <button className="verification-copy" type="button" onClick={copy} disabled={!code}
        aria-label={t("复制 {value1} 验证码到剪贴板", { value1: entry.issuer })}><Copy size={20} /><span>{t("复制")}</span></button>
    </div>
  </article>;
}
