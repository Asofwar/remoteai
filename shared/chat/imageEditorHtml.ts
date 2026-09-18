import { validateChatImages } from '../remote-chat/attachments';
import { getChatPolicy, KIB } from '../remote-chat/policy';
import { imageEditorScript } from './imageEditorScript';

const COLORS = [['#ef4444', '红色'], ['#facc15', '黄色'], ['#22c55e', '绿色'],
  ['#3b82f6', '蓝色'], ['#ffffff', '白色'], ['#111111', '黑色']];

/** A local canvas editor shared by the phone WebView and browser. No remote content is loaded. */
export function imageEditorHtml(dataUrl: string, translate = (text: string) => text, language = 'zh-CN') {
  validateChatImages([dataUrl]);
  const policy = getChatPolicy();
  const label = (text: string) => translate(text).replace(/[&<>"']/g, character =>
    `&#${character.charCodeAt(0)};`);
  const config = JSON.stringify({ dataUrl, targetBytes: policy.imageTargetKb * KIB,
    maxEdge: policy.imageMaxEdge, labels: {
      saving: translate('正在保存…'),
      saveFailed: translate('图片保存失败，请撤销部分标注后重试。'),
      unavailable: translate('图片无法编辑，请重新打开后再试。'),
      hint: translate('在图片上拖动画标注，完成后即可发送。'),
      readFailed: translate('图片无法读取，请重新选择。'),
    } }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="${language === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:;
  script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #161616; color: #fff;
  font: 15px system-ui, sans-serif; }
body { display: flex; flex-direction: column; }
header, footer { flex-shrink: 0; padding: 8px 12px; background: #222; }
header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
button, select { font: inherit; color: inherit; background: #333; border: 1px solid #555;
  border-radius: 9px; min-height: 44px; padding: 8px 12px; touch-action: manipulation; }
button:disabled { opacity: .4; }
button[aria-pressed="true"] { outline: 2px solid #fff; outline-offset: -3px; background: #555; }
#done { background: #237a4b; }
#stage { flex: 1; min-height: 0; min-width: 0; display: flex; justify-content: center; align-items: center;
  overflow: hidden; padding: 8px; }
canvas { display: block; touch-action: none; }
.row { display: flex; gap: 6px; align-items: center; justify-content: center; flex-wrap: wrap; }
.row + .row { margin-top: 8px; }
.color { width: 44px; padding: 8px; }
.color span { display: block; border-radius: 50%; width: 24px; height: 24px; border: 1px solid #888; }
#notice { max-width: 400px; margin: 6px auto 0; font-size: 13px; text-align: center; color: #ccc; }
footer { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
</style></head><body>
<header><button id="cancel">${label('取消')}</button><strong>${label('图片标注')}</strong><button id="done" disabled>${label('完成')}</button></header>
<main id="stage"><canvas aria-label="${label('图片标注画布')}"></canvas></main>
<footer><div class="row" id="tools">
<button data-tool="pen" aria-pressed="true">${label('画笔')}</button>
<button data-tool="arrow" aria-pressed="false">${label('箭头')}</button>
<button data-tool="rectangle" aria-pressed="false">${label('方框')}</button>
<button id="undo" disabled>${label('撤销')}</button><button id="redo" disabled>${label('重做')}</button>
</div><div class="row">
${COLORS.map(([color, colorLabel], index) => `<button class="color" data-color="${color}" aria-label="${label(colorLabel)}"
  aria-pressed="${index === 0}"><span style="background:${color}"></span></button>`).join('')}
<select id="width" aria-label="${label('画笔粗细')}"><option value="3">${label('细')}</option>
<option value="6" selected>${label('中')}</option><option value="10">${label('粗')}</option></select>
</div><p id="notice" role="status">${label('正在加载图片…')}</p></footer>
<script>const config = ${config};${imageEditorScript}</script></body></html>`;
}

export function editedImageMessage(raw: string): string | null {
  const message: unknown = JSON.parse(raw);
  if (!message || typeof message !== 'object' || !('type' in message)) return null;
  if (message.type !== 'save' || !('dataUrl' in message) || typeof message.dataUrl !== 'string') return null;
  validateChatImages([message.dataUrl]);
  return message.dataUrl;
}
