import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import reported from '../../../shared/chat/toolDetailsFixture.json';
import { ChatToolDetails } from '../src/chat/ChatToolDetails';
import { TOOL_OUTPUT_PAGE_CHARACTERS } from '../../../shared/chat/toolOutput';
import '../src/styles.css';
import '../src/chat/chat.css';
import '../src/chat/messages.css';

const outputLine = 'Tool output line.\n';
const longText = outputLine.repeat(Math.ceil(TOOL_OUTPUT_PAGE_CHARACTERS / outputLine.length)) + '\nOUTPUT_END';
const samples = {
  reported,
  long: { ...reported, result: { content: [{ type: 'text', text: longText }] } },
  literal: { ...reported, result: '<div>literal output</div>\n**keep these characters**' },
};

function Harness() {
  const [open, setOpen] = useState(true);
  const [sample, setSample] = useState<keyof typeof samples>('reported');
  return <main style={{ padding: 20 }}>
    {(Object.keys(samples) as (keyof typeof samples)[]).map(key =>
      <button key={key} onClick={() => { setSample(key); setOpen(true); }}>{key}</button>)}
    {open && <ChatToolDetails key={sample} item={samples[sample]}
      onClose={() => setOpen(false)} onBack={() => setOpen(false)} />}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
