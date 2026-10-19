import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { KeyboardShortcutsCard } from '../src/pages/settings/KeyboardShortcutsCard';
import { translate } from '../src/i18n';
import '../src/pages/SettingsPage/index.module.less';
import './keyboard-shortcuts.css';

createRoot(document.getElementById('root')!).render(<ConfigProvider>
  <main className="settings-page"><h1>快捷键</h1>
    <p>设置常用操作的全局快捷键，应用在后台运行时也可使用。</p>
    <KeyboardShortcutsCard t={(key, values) => translate('zh', key, values)} />
  </main>
</ConfigProvider>);
