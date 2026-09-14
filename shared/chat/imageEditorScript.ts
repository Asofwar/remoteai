// Kept as a self-contained script so it runs identically in the native WebView and sandboxed iframe.
export const imageEditorScript = String.raw`
const canvas = document.querySelector('canvas');
const context = canvas.getContext('2d');
const stage = document.querySelector('#stage');
const notice = document.querySelector('#notice');
const done = document.querySelector('#done');
const undo = document.querySelector('#undo');
const redo = document.querySelector('#redo');
const image = new Image();
const strokes = [];
const undone = [];
let current = null;
let pointer = null;
let tool = 'pen';
let color = '#ef4444';
let ready = false;

function send(message) {
  const payload = JSON.stringify(message);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
  else window.parent.postMessage(payload, '*');
}
function drawStroke(stroke) {
  const points = stroke.points;
  const start = points[0];
  const end = points[points.length - 1];
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (stroke.tool === 'rectangle') {
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    return;
  }
  if (points.length === 1) {
    context.arc(start.x, start.y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(start.x, start.y);
  if (stroke.tool === 'pen') points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  else context.lineTo(end.x, end.y);
  context.stroke();
  if (stroke.tool === 'arrow') drawArrowHead(start, end, stroke.width);
}
function drawArrowHead(start, end, width) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.min(width * 5, Math.hypot(end.x - start.x, end.y - start.y) / 2);
  context.beginPath();
  context.moveTo(end.x - length * Math.cos(angle - Math.PI / 6), end.y - length * Math.sin(angle - Math.PI / 6));
  context.lineTo(end.x, end.y);
  context.lineTo(end.x - length * Math.cos(angle + Math.PI / 6), end.y - length * Math.sin(angle + Math.PI / 6));
  context.stroke();
}
function render() {
  if (!ready) return;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  strokes.forEach(drawStroke);
  if (current) drawStroke(current);
  undo.disabled = !strokes.length || !!current;
  redo.disabled = !undone.length || !!current;
  done.disabled = !!current;
}
function fit() {
  if (!ready) return;
  const scale = Math.min((stage.clientWidth - 16) / canvas.width, (stage.clientHeight - 16) / canvas.height);
  canvas.style.width = Math.max(1, canvas.width * scale) + 'px';
  canvas.style.height = Math.max(1, canvas.height * scale) + 'px';
}
function point(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height)) };
}
canvas.addEventListener('pointerdown', (event) => {
  if (!ready || pointer !== null || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  current = { tool, color, width: Number(document.querySelector('#width').value)
    * Math.max(canvas.width, canvas.height) / 600, points: [point(event)] };
  render();
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointer || !current) return;
  event.preventDefault();
  const next = point(event);
  if (current.tool === 'pen') current.points.push(next);
  else current.points = [current.points[0], next];
  render();
});
function finish(event) {
  if (event.pointerId !== pointer || !current) return;
  if (event.type === 'pointerup') {
    const next = point(event);
    if (current.tool === 'pen') current.points.push(next);
    else current.points = [current.points[0], next];
    strokes.push(current);
    undone.length = 0;
  }
  current = null;
  pointer = null;
  render();
}
canvas.addEventListener('pointerup', finish);
canvas.addEventListener('pointercancel', finish);
canvas.addEventListener('lostpointercapture', finish);
document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
  tool = button.dataset.tool;
  document.querySelectorAll('[data-tool]').forEach((item) => {
    item.setAttribute('aria-pressed', String(item === button));
  });
}));
document.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => {
  color = button.dataset.color;
  document.querySelectorAll('[data-color]').forEach((item) => {
    item.setAttribute('aria-pressed', String(item === button));
  });
}));
undo.addEventListener('click', () => { if (strokes.length) undone.push(strokes.pop()); render(); });
redo.addEventListener('click', () => { if (undone.length) strokes.push(undone.pop()); render(); });
document.querySelector('#cancel').addEventListener('click', () => send({ type: 'cancel' }));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') send({ type: 'cancel' });
});
function exportImage() {
  if (!strokes.length) return config.dataUrl;
  const output = document.createElement('canvas');
  const outputContext = output.getContext('2d');
  let edge = Math.min(config.maxEdge, Math.max(canvas.width, canvas.height));
  // The original can be smaller than the normal compression floor.
  const floor = Math.min(128, edge);
  while (edge >= floor) {
    const scale = edge / Math.max(canvas.width, canvas.height);
    output.width = Math.max(1, Math.round(canvas.width * scale));
    output.height = Math.max(1, Math.round(canvas.height * scale));
    outputContext.drawImage(canvas, 0, 0, output.width, output.height);
    for (const quality of [0.8, 0.65, 0.5]) {
      const url = output.toDataURL('image/jpeg', quality);
      if (url.length * 3 / 4 <= config.targetBytes) return url;
    }
    edge = Math.floor(edge / 2);
  }
  throw new Error('image-too-large');
}
done.addEventListener('click', () => {
  if (!ready || current) return;
  done.disabled = true;
  notice.textContent = '正在保存…';
  // Let the saving state paint before encoding on the WebView thread.
  setTimeout(() => {
    try { send({ type: 'save', dataUrl: exportImage() }); }
    catch { notice.textContent = '图片保存失败，请撤销部分标注后重试。'; }
    finally { done.disabled = false; }
  }, 30);
});
image.onload = () => {
  if (!context) { notice.textContent = '图片无法编辑，请重新打开后再试。'; return; }
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  ready = true;
  fit(); render();
  notice.textContent = '在图片上拖动画标注，完成后即可发送。';
};
image.onerror = () => { notice.textContent = '图片无法读取，请重新选择。'; };
new ResizeObserver(fit).observe(stage);
image.src = config.dataUrl;
`;
