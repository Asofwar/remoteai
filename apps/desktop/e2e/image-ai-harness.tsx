import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageViewer } from '../../../shared/chat/ImageViewer';
import { ImageAiContext } from '../../../shared/chat/ImageAiContext';
const canvas = document.createElement('canvas');
canvas.width = 900; canvas.height = 520;
const context = canvas.getContext('2d')!;
context.fillStyle = '#37cbea'; context.fillRect(0, 0, 900, 520);
context.fillStyle = '#ffe275'; context.fillRect(0, 350, 900, 170);
context.fillStyle = '#058cea'; context.beginPath(); context.arc(150, 340, 170, 0, Math.PI * 2); context.fill();
const source = canvas.toDataURL();
function Harness() {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState('');
  return <main style={{ padding: 40, fontFamily: 'sans-serif', background: '#faf8f2', minHeight: '100vh' }}>
    <h1>图片编辑预览</h1><p>这段背景文字应在桌面预览遮罩后仍然可见。</p>
    <textarea aria-label="消息草稿" defaultValue="保留我的草稿" />
    <button onClick={() => setOpen(true)}>打开预览</button><pre data-testid="result">{result}</pre>
    <ImageAiContext.Provider value={{ enabled: true, send: async (text, image) => {
      setResult(JSON.stringify({ text, original: image === source })); return true;
    } }}>
      {open && <ImageViewer thumbnail={source} description="测试图片" load={async () => source}
        download={async url => { setResult(JSON.stringify({ downloaded: url === source })); }}
        close={() => setOpen(false)} />}
    </ImageAiContext.Provider>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
