import { renderToString } from 'react-dom/server';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { App, type Route } from './App';
import { renderHead } from './lib/metadata';
export { routes } from './lib/routes';
export { renderMarkdown } from './lib/markdown';
export { pageMetadata } from './lib/metadata';

export function render(route: Route) {
  const cache = createCache();
  const body = renderToString(
    <StyleProvider cache={cache}>
      <App {...route} />
    </StyleProvider>,
  );
  return { body, head: `${renderHead(route)}\n${extractStyle(cache)}` };
}
