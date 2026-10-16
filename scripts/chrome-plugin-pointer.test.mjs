import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { POINTER_FUNCTION, removePointerLayers }
  from '../apps/desktop/src-tauri/resources/chrome-extension/pointer-overlay.js';
import { clearTabPointer, movePointer, showPointer }
  from '../apps/desktop/src-tauri/resources/chrome-extension/pointer.js';

let dom;
afterEach(() => { dom?.window.close(); delete globalThis.chrome; });

function page({ reduced = false } = {}) {
  dom = new JSDOM('<button>Target</button>', { runScripts: 'outside-only' });
  const { window } = dom;
  const animations = [];
  const timers = new Map();
  let timerId = 0;
  window.matchMedia = () => ({ matches: reduced });
  window.setTimeout = callback => { timers.set(++timerId, callback); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  window.Element.prototype.animate = function (frames, options) {
    const animation = { frames, options, element: this, cancelled: false,
      cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  };
  const update = window.eval(`(${POINTER_FUNCTION})`);
  const remove = window.eval(`(${removePointerLayers.toString()})`);
  return { window, animations, timers, remove,
    update: action => update({ ownerId: 'fixture', phase: 'move', x: 100, y: 200, ...action }) };
}

test('black pointer moves smoothly, pulses on press and never participates in page hit testing', () => {
  const { window, animations, update } = page();
  assert.equal(update({ animate: true }), 180);
  const state = window.__remoteAIControlPointer;
  assert.equal(state.cursor.querySelector('path').getAttribute('fill'), '#000000');
  assert.equal(state.cursor.querySelector('path').getAttribute('stroke'), '#000000');
  assert.equal(state.host.getAttribute('aria-hidden'), 'true');
  assert.equal(state.host.inert, true);
  assert.equal(state.host.style.pointerEvents, 'none');
  assert.equal(state.host.shadowRoot, null);
  assert.equal(state.host.textContent, '');
  update({ x: 300, y: 250, animate: true });
  assert.equal(animations.at(-1).frames[0].transform, 'translate(98px,199px)');
  assert.equal(state.host.style.transform, 'translate(298px,249px)');
  update({ x: 300, y: 250, phase: 'press' });
  assert.equal(state.cursor.style.transform, 'scale(.88)');
  assert.equal(animations.at(-1).element, state.ring);
  update({ phase: 'release' });
  assert.equal(state.cursor.style.transform, 'scale(1)');
});

test('idle hiding is bounded and cleanup cancels animation and timers without touching other owners', () => {
  const { window, animations, timers, update, remove } = page();
  update({ animate: true, phase: 'press' });
  assert.equal(timers.size, 1);
  const state = window.__remoteAIControlPointer;
  [...timers.values()][0]();
  assert.equal(state.host.style.opacity, '0');
  update({});
  assert.equal(state.host.style.opacity, '1');
  assert.equal(timers.size, 1);
  remove('another-extension');
  assert.ok(state.host.isConnected);
  remove('fixture');
  assert.equal(window.document.querySelector('[data-remote-ai-pointer]'), null);
  assert.equal(window.__remoteAIControlPointer, undefined);
  assert.equal(timers.size, 0);
  assert.ok(animations.every(animation => animation.cancelled));
});

test('reduced motion skips pointer travel and keeps click feedback still', () => {
  const { animations, update } = page({ reduced: true });
  assert.equal(update({ animate: true, phase: 'press' }), 0);
  assert.equal(animations.length, 1);
  assert.equal(animations[0].frames[0].transform, animations[0].frames[1].transform);
});

function driverFixture() {
  const calls = [];
  let denied = false;
  globalThis.chrome = {
    runtime: { id: 'fixture' }, permissions: { contains: async () => true },
    storage: { local: { get: async () => ({ siteAccessMode: 'all' }) } },
    scripting: { executeScript: async args => calls.push({ cleanup: args }) },
  };
  const driver = { tab: { id: 74 }, context: { clientId: 'fixture' },
    guard: async () => { if (denied) throw new Error('revoked'); },
    send: async (method, params, frameId) => {
      await driver.guard();
      calls.push({ method, params, frameId });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: {
        id: frameId === 'remote' ? 'remote-root' : 'main-root', url: 'https://fixture.example/' } } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 42 };
      return { result: { value: 0 } };
    } };
  return { driver, calls, deny: () => { denied = true; } };
}

test('pointer uses each input session viewport, caches its world and cleans up when changing frames', async () => {
  const { driver, calls } = driverFixture();
  await movePointer(driver, { x: 10, y: 20 });
  await showPointer(driver, { x: 10, y: 20 }, { phase: 'press' });
  assert.equal(calls.filter(call => call.method === 'Page.createIsolatedWorld').length, 1);
  await showPointer(driver, { x: 5, y: 6, frameId: 'remote' });
  assert.equal(calls.filter(call => call.cleanup).length, 1);
  assert.equal(calls.findLast(call => call.method === 'Page.createIsolatedWorld').params.frameId, 'remote-root');
  assert.equal(calls.findLast(call => call.method === 'Runtime.callFunctionOn').frameId, 'remote');
  await clearTabPointer(driver.tab.id);
  assert.equal(calls.filter(call => call.cleanup).length, 2);
});

test('cosmetic failure permits native input but never swallows cancellation or revoked access', async () => {
  const { driver, calls, deny } = driverFixture();
  const send = driver.send;
  driver.send = (method, ...args) => {
    if (method === 'Page.getFrameTree') throw new Error('context destroyed');
    return send(method, ...args);
  };
  await movePointer(driver, { x: 1, y: 2 });
  assert.equal(calls.at(-1).method, 'Input.dispatchMouseEvent');
  deny();
  await assert.rejects(movePointer(driver, { x: 1, y: 2 }), /revoked/);
  assert.equal(calls.length, 1);
});
