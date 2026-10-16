import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GuiController } from '../src/pages/codexGui/controller';
import { useComposerDraft } from '../src/pages/codexGui/useComposerDraft';
import { SkillInput } from '../src/pages/codexGui/SkillInput';
import { ComposerReferences } from '../src/pages/codexGui/ComposerReferences';
import '../src/styles.css';

const controller = new GuiController();
controller.send = async (text, images, skills, attachments) => {
  document.body.dataset.sent = JSON.stringify({ text, images, skills, attachments });
  return true;
};
function Harness() {
  const draft = useComposerDraft('new', controller);
  const [beats, setBeats] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setBeats(value => value + 1), 50);
    return () => clearInterval(timer);
  }, []);
  return <main style={{ margin: '80px auto', maxWidth: 760, padding: 24 }}>
    <output aria-label="刷新次数" hidden>{beats}</output>
    <ComposerReferences items={draft.draft.attachments ?? []} disabled={false} onRemove={draft.removeAttachment} />
    <SkillInput value={draft.draft} draftKey="new" cwd="" active connected disabled={false}
      placeholder="消息" onChange={draft.editContent} onPaste={draft.paste}
      onSend={() => void draft.send()} />
    <button disabled={draft.reading} onClick={() => void draft.send()}>发送消息</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
