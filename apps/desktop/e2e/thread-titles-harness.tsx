import { StrictMode, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { GuiController } from '../src/pages/codexGui/controller';
import { ThreadSidebar } from '../src/pages/codexGui/ThreadSidebar';
import { useTitleSettings } from '../src/pages/codexGui/useTitleSettings';
import { useUsageStatus } from '../src/pages/codexGui/useUsageStatus';

const controller = new GuiController();
function Harness() {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [active, setActive] = useState(true);
  const [text, setText] = useState('');
  const [beats, setBeats] = useState(0);
  useTitleSettings(active, controller.titles.settings);
  const { usage } = useUsageStatus(active);
  useEffect(() => { void controller.connect(); }, []);
  useEffect(() => {
    const timer = setInterval(() => setBeats((count) => count + 1), 50);
    return () => clearInterval(timer);
  }, []);
  return <ConfigProvider><App><main>
    <button onClick={() => setActive(!active)}>{active ? '离开 GUI' : '打开 GUI'}</button>
    <output aria-label="刷新次数">{beats}</output>
    <p>{usage ? `用量 ${usage.totalTokens}` : '正在刷新用量'}</p>
    <div style={{ display: 'flex', minHeight: 400 }}>
      <ThreadSidebar state={state} controller={controller} accountPicker={null}
        focused={false} onToggleFocus={() => {}} />
      <section style={{ padding: 24 }}>
        <p>当前对话：<output aria-label="当前对话">{state.selected ?? '新对话'}</output></p>
        <p role="status" aria-label="回复状态">
          {Object.values(state.conversations).some((value) => value.activeTurn) ? '正在回复' : '可以发送'}</p>
        <textarea aria-label="聊天消息" value={text} onChange={(event) => setText(event.target.value)} />
        <button disabled={state.sending || state.connection !== 'ready'} onClick={async () => {
          if (await controller.send(text, [])) setText('');
        }}>发送</button>
        {state.error && <p role="alert">{state.error}</p>}
      </section>
    </div>
  </main></App></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
