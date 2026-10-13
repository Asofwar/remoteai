import assert from 'node:assert/strict';
import test from 'node:test';
import { win32 } from 'node:path';
import { resolveCmakeTool } from './resolve-cmake-tool.mjs';

const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' };
const bundledBin = 'F:\\开发工具 Build Tools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin';

function fixture({ available = [], discovered = [], vswhereStatus = 0 } = {}) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (command.endsWith('vswhere.exe')) {
      return { status: vswhereStatus, stdout: `${discovered.join('\r\n')}\r\n` };
    }
    if (available.includes(command)) return { status: 0 };
    return { status: null, error: Object.assign(new Error('Not found'), { code: 'ENOENT' }) };
  };
  return { calls, options: { platform: 'win32', env, run } };
}

test('uses tools already on PATH without querying Visual Studio', () => {
  const { calls, options } = fixture({ available: ['cmake'] });
  assert.equal(resolveCmakeTool('cmake', options), 'cmake');
  assert.equal(calls.length, 1);
});

for (const tool of ['cmake', 'ctest']) {
  test(`finds bundled ${tool} in a custom Visual Studio directory with spaces`, () => {
    const executable = win32.join(bundledBin, `${tool}.exe`);
    const { calls, options } = fixture({ available: [executable], discovered: [executable] });
    assert.equal(resolveCmakeTool(tool, options), executable);
    const query = calls.find(({ command }) => command.endsWith('vswhere.exe'));
    assert.deepEqual(query.args.slice(0, 3), ['-products', '*', '-find']);
    assert.ok(query.args[3].endsWith(`\\${tool}.exe`));
    assert.ok(query.args.includes('-utf8'));
    assert.equal(query.options.windowsHide, true);
    assert.equal(query.options.env, env);
  });
}

test('skips unusable tools in one Visual Studio installation and tries the next', () => {
  const executable = win32.join(bundledBin, 'cmake.exe');
  const { options } = fixture({ available: [executable], discovered: ['C:\\Stale\\cmake.exe', executable] });
  assert.equal(resolveCmakeTool('cmake', options), executable);
});

test('finds a standalone CMake installation when vswhere is unavailable', () => {
  const executable = 'C:\\Program Files\\CMake\\bin\\cmake.exe';
  const { options } = fixture({ available: [executable], vswhereStatus: null });
  assert.equal(resolveCmakeTool('cmake', options), executable);
});

test('missing Windows tools produce actionable installation guidance', () => {
  const { options } = fixture();
  assert.throws(() => resolveCmakeTool('cmake', options), /C\+\+ CMake tools for Windows.*PATH/);
});

test('macOS keeps PATH lookup without probing Windows installations', () => {
  const { calls, options } = fixture({ available: ['cmake'] });
  assert.equal(resolveCmakeTool('cmake', { ...options, platform: 'darwin' }), 'cmake');
  assert.equal(calls.length, 1);
});

test('missing macOS tools report CMake installation guidance', () => {
  const { calls, options } = fixture();
  assert.throws(() => resolveCmakeTool('cmake', { ...options, platform: 'darwin' }), /Install CMake.*PATH/);
  assert.equal(calls.length, 1);
});
