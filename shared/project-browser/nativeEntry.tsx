import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectBrowser, type ProjectBrowserHandle } from './ProjectBrowser';
import type { BrowserHostMessage, BrowserSettings } from './nativeBridge';
import type { ProjectBrowserClient } from './protocol';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    projectBrowserMessage: (message: BrowserHostMessage) => void;
  }
}

const REQUEST_TIMEOUT = 60_000;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> }>();
let nextId = 0;
const send = (message: unknown) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));
const request = <T,>(action: string, body: object) => new Promise<T>((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => {
    pending.delete(id); reject(new Error('请求超时，请重试。'));
  }, REQUEST_TIMEOUT);
  pending.set(id, { resolve: value => resolve(value as T), reject, timer });
  send({ type: 'request', id, action, body });
});
const client: ProjectBrowserClient = {
  list: (_cwd, directory) => request('list', { directory }),
  read: target => request('read', target),
  save: target => request('save', target),
};
const element = document.getElementById('root');
if (!element) throw new Error('Missing browser root');
const root = createRoot(element);
const browser = createRef<ProjectBrowserHandle>();
function render(settings: BrowserSettings) {
  for (const [name, value] of Object.entries(settings.theme)) {
    if (/^--[\w-]+$/.test(name)) document.documentElement.style.setProperty(name, value);
  }
  root.render(<ProjectBrowser key={settings.cwd} ref={browser} client={client} cwd={settings.cwd}
    connected={settings.connected} t={text => settings.labels[text] ?? text}
    onClose={() => send({ type: 'closed' })} />);
}
window.projectBrowserMessage = message => {
  if (message.type === 'settings') { render(message); return; }
  if (message.type === 'close') { browser.current?.requestClose(); return; }
  const task = pending.get(message.id);
  if (!task) return;
  clearTimeout(task.timer); pending.delete(message.id);
  if (message.error) task.reject(new Error(message.error)); else task.resolve(message.data);
};
send({ type: 'ready' });
