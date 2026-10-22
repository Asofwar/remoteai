import { createRoot, hydrateRoot } from 'react-dom/client';
import { App, type Route } from './App';
import { isLanguage, readRoute } from './lib/site';
import './styles/theme.css';
import './styles/base.css';
import './styles/home.css';
import './styles/home-responsive.css';
import './styles/pages.css';
import './styles/pages-responsive.css';
import './styles/illustrations.css';
import './styles/showcase.css';
import './styles/stories.css';
import './styles/resources.css';

const container = document.getElementById('root');
if (!container) throw new Error('Website root is missing.');
const language = container.dataset.language;
// Pages serves the same 404 HTML for unknown URLs, including English-looking paths.
const route: Route =
  isLanguage(language) && container.dataset.path !== undefined
    ? { language, path: container.dataset.path }
    : readRoute(window.location.pathname);
// The dev server uses the template; production always hydrates exported HTML.
const content = <App {...route} />;
if (container.querySelector('main')) hydrateRoot(container, content);
else createRoot(container).render(content);
