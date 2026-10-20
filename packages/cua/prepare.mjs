import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directory, root, run, source, upstream } from './common.mjs';

export function prepare() {
  if (!existsSync(source)) {
    run('git', ['clone', '--depth=1', '--branch', `cua-driver-rs-v${upstream.version}`,
      '--filter=blob:none', '--sparse', upstream.repository, source],
      { cwd: root });
  }
  const git = (...args) => run('git', args, { cwd: source, encoding: 'utf8', stdio: 'pipe' });
  if (git('rev-parse', 'HEAD') !== upstream.commit) {
    if (git('status', '--porcelain')) throw new Error('CUA source has uncommitted changes');
    git('fetch', '--depth=1', 'origin', upstream.commit);
    git('checkout', '--detach', upstream.commit);
  }
  git('sparse-checkout', 'set', 'libs/cua-driver', 'libs/cua', 'libs/images');
  const patch = join(directory, 'patches/windows-native-launch.patch');
  if (!git('status', '--porcelain')) {
    git('apply', '--check', patch);
    git('apply', patch);
  }
  verifySource({ source, patch, commit: upstream.commit });
}

// Compare against a private index built from the pinned commit plus exactly our patch.
// Reverse-apply alone also accepts unrelated changes, so it is not a release integrity check.
export function verifySource({ source: checkout, patch, commit }) {
  const scratch = mkdtempSync(join(tmpdir(), 'remoteai-cua-index-'));
  const skipped = run('git', ['ls-files', '-t', '-z'], { cwd: checkout, encoding: 'utf8', stdio: 'pipe',
    maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(line => line.startsWith('S ')).map(line => line.slice(2));
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index') };
  const git = (...args) => run('git', args, { cwd: checkout, encoding: 'utf8', stdio: 'pipe',
    env });
  try {
    if (git('rev-parse', 'HEAD') !== commit) throw new Error('CUA upstream revision mismatch');
    git('read-tree', commit);
    git('apply', '--cached', patch);
    if (skipped.length) run('git', ['update-index', '--skip-worktree', '-z', '--stdin'],
      { cwd: checkout, env, stdio: 'pipe', input: `${skipped.join('\0')}\0` });
    git('diff', '--quiet', '--no-ext-diff');
    if (git('ls-files', '--others', '--exclude-standard')) throw new Error('Untracked CUA source files');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export async function patchBytes() {
  return readFile(join(directory, 'patches/windows-native-launch.patch'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepare();
