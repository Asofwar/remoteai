import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { asset, run, upstream, version } from '../common.mjs';
import { verifySource } from '../prepare.mjs';

test('release targets preserve the upstream runtime contract', () => {
  assert.match(version, new RegExp(`^${upstream.version.replaceAll('.', '\\.')}\\-remoteai\\.\\d+$`));
  assert.match(upstream.commit, /^[a-f0-9]{40}$/);
  for (const target of ['windows-x86_64', 'windows-arm64', 'darwin-universal']) {
    const info = asset(target);
    assert.match(info.sha256, /^[a-f0-9]{64}$/);
    assert.ok(info.filename.startsWith(`cua-driver-rs-${version}-`));
  }
  assert.throws(() => asset('../../unexpected'));
});

test('source verification rejects changes beyond the patch, including new files', () => {
  const root = mkdtempSync(join(tmpdir(), 'remoteai-cua-source-test-'));
  const source = join(root, 'source');
  mkdirSync(source);
  const git = (...args) => run('git', args, { cwd: source, stdio: 'pipe' });
  try {
    git('init');
    git('config', 'core.autocrlf', 'false');
    writeFileSync(join(source, 'existing.rs'), 'original\n');
    git('add', '.');
    git('-c', 'user.name=CUA test', '-c', 'user.email=cua@example.invalid', 'commit', '-m', 'fixture');
    const commit = git('rev-parse', 'HEAD');
    writeFileSync(join(source, 'existing.rs'), 'patched\n');
    writeFileSync(join(source, 'new.rs'), 'new patch module\n');
    git('add', '-N', 'new.rs');
    const patch = join(root, 'fix.patch');
    writeFileSync(patch, `${git('diff', '--binary', 'HEAD')}\n`);
    verifySource({ source, patch, commit });
    writeFileSync(join(source, 'existing.rs'), 'unreviewed\n');
    assert.throws(() => verifySource({ source, patch, commit }));
    writeFileSync(join(source, 'existing.rs'), 'patched\n');
    writeFileSync(join(source, 'unexpected.rs'), 'unreviewed\n');
    assert.throws(() => verifySource({ source, patch, commit }), /Untracked/);
    rmSync(join(source, 'unexpected.rs'));
    const originalPatch = readFileSync(patch);
    writeFileSync(patch, 'invalid patch');
    assert.throws(() => verifySource({ source, patch, commit }));
    writeFileSync(patch, originalPatch);
    assert.throws(() => verifySource({ source, patch, commit: '0'.repeat(40) }), /revision/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
