import { ConfigProvider } from 'antd';
import { findFeature } from './content/features';
import type { Language } from './content/types';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Features } from './pages/Features';
import { FeatureDetail } from './pages/FeatureDetail';
import { Download } from './pages/Download';
import { Guide } from './pages/Guide';
import { Resources } from './pages/Resources';
import { href } from './lib/site';
import { ui } from './lib/ui-text';

export interface Route {
  language: Language;
  path: string;
}

function Page({ language, path }: Route) {
  if (!path) return <Home language={language} />;
  if (path === 'features/') return <Features language={language} />;
  if (path === 'download/') return <Download language={language} />;
  if (path === 'guide/') return <Guide language={language} />;
  if (path === 'resources/') return <Resources language={language} />;
  const feature = findFeature(path.replace(/^features\//, '').replace(/\/$/, ''));
  if (path.startsWith('features/') && feature) return <FeatureDetail feature={feature} language={language} />;
  return (
    <section className="shell not-found">
      <p className="eyebrow">404 / REMOTE AI</p>
      <h1>{ui(language, 'notFoundTitle')}</h1>
      <a className="text-link" href={href(language)}>
        {ui(language, 'returnHome')} ↗
      </a>
    </section>
  );
}

export function App({ language, path }: Route) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#e92f73',
          colorText: '#19191e',
          colorBgContainer: '#fff',
          borderRadius: 8,
          fontFamily: 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          controlHeight: 40,
          controlHeightLG: 50,
          fontSize: 14,
        },
        components: { Button: { primaryShadow: 'none', fontWeight: 600 } },
      }}
    >
      <Layout language={language} path={path}>
        <Page language={language} path={path} />
      </Layout>
    </ConfigProvider>
  );
}
