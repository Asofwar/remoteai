import type { ReactElement } from 'react';
import { Dropdown, message } from 'antd';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { guiText } from '../../i18n/guiText';
import { copyText } from '../../utils/clipboard';

function reportLinkError() {
  void message.error({ content: guiText('链接暂时无法打开，请稍后重试。'),
    style: { maxWidth: 400, marginInline: 'auto' } });
}

export async function openWebsiteInBrowser(url: string) {
  try {
    if (isTauri()) await openUrl(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch { reportLinkError(); }
}

export function WebsiteLinkMenu({ href, children }: { href: string; children: ReactElement }) {
  // WebView's built-in new-window action bypasses React clicks and does not open the system browser.
  // Browser pages retain their own context menu and popup handling.
  if (!isTauri()) return children;
  const copy = async () => {
    try { await copyText(href); }
    catch { void message.error({ content: guiText('复制失败，请重试。'),
      style: { maxWidth: 400, marginInline: 'auto' } }); }
  };
  return <Dropdown trigger={['contextMenu']} overlayStyle={{ maxWidth: 400 }} menu={{ items: [
    { key: 'open', label: guiText('在浏览器中打开'), onClick: () => { void openWebsiteInBrowser(href); } },
    { key: 'copy', label: guiText('复制链接'), onClick: () => { void copy(); } },
  ] }}>{children}</Dropdown>;
}
