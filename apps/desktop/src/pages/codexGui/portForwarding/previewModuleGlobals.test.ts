import { expect, it } from 'vitest';
import { parse } from 'acorn';
import { BROWSER_MODULE, previewModuleGlobals } from '../../../../../web/src/chat/portMapping/previewModuleGlobals';

it('adapts browser globals without replacing shadowed function or block bindings', () => {
  const source = 'export function route(window) { return window.location; }'
    + '{ const document = {}; document.title = "inner"; }'
    + 'export const active = window.location.pathname + document.title;';
  const prefix = previewModuleGlobals(source);
  expect(prefix).toContain('{window,document,location}');
  expect(() => parse(prefix + source, { ecmaVersion: 'latest', sourceType: 'module' })).not.toThrow();
});

it('preserves imported, exported, destructured and hoisted module bindings', () => {
  for (const source of [
    'import window from "./window.js"; export {window};',
    'export const {document, ...location} = {};',
    'if (true) { var history; } export {history};',
    'export default function self() {}',
    'export class globalThis {}',
  ]) {
    expect(previewModuleGlobals(source)).toBe('');
  }
});

it('uses one internal browser module and leaves source without browser globals alone', () => {
  expect(previewModuleGlobals('export const value = 1')).toBe('');
  expect(previewModuleGlobals('window.location.href')).toContain(JSON.stringify(BROWSER_MODULE.url));
  expect(BROWSER_MODULE.code).toContain('globalThis.__previewBrowser');
});
