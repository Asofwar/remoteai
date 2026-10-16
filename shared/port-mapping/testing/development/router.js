import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';

const h = React.createElement;
function Page({ title, next }) {
  const navigate = useNavigate();
  return h('main', null, h('h1', null, title),
    h(Link, { to: next }, 'Next route'), h('button', { onClick: () => navigate(-1) }, 'Previous route'),
    h('button', { onClick: () => {
      try { history.pushState({}, '', 'https://example.invalid/#/outside'); }
      catch (error) { document.getElementById('isolation').textContent = error.name; }
    } }, 'Check route isolation'), h('p', { id: 'isolation' }));
}
const Router = location.search.includes('hash') ? HashRouter : BrowserRouter;
createRoot(document.getElementById('root')).render(h(Router, null, h(Routes, null,
  h(Route, { path: '*', element: h(Navigate, { to: '/login', replace: true }) }),
  h(Route, { path: '/login', element: h(Page, { title: 'Router login', next: '/home' }) }),
  h(Route, { path: '/home', element: h(Page, { title: 'Router home', next: '/login' }) }),
)));
