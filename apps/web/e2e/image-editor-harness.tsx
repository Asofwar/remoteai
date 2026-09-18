import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatImageEditor } from '../src/chat/ChatImageEditor';
import { setLanguage } from '../src/i18n';
import '../src/styles.css';

const params = new URLSearchParams(location.search);
if (params.has('english')) setLanguage('en');

function testImage() {
  const canvas = document.createElement('canvas');
  canvas.width = params.has('wide') ? 1200 : 600;
  canvas.height = params.has('wide') ? 300 : 800;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#cfe8e4');
  gradient.addColorStop(0.5, '#72978c');
  gradient.addColorStop(1, '#e9d4a7');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff55';
  for (let x = 0; x < canvas.width; x += 19) context.fillRect(x, 0, 3, canvas.height);
  context.fillStyle = '#fff';
  context.font = '500 28px system-ui';
  context.fillText('IMAGE / 01', 32, 56);
  return canvas.toDataURL('image/png');
}

function Harness() {
  const [url, setUrl] = useState(testImage);
  const [open, setOpen] = useState(true);
  return <>
    <button onClick={() => setOpen(true)}>打开标注</button>
    <img aria-label="保存的图片" src={url} style={{ maxWidth: '80vw', maxHeight: '80vh' }} />
    {open && <ChatImageEditor image={{ id: 'test', url }} save={setUrl} close={() => setOpen(false)} />}
  </>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
