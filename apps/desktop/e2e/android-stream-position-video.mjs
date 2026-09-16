import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, output, serial } from './android-chat-driver.mjs';

const exec = promisify(execFile);
const WIDTH = 360;
const HEIGHT = 808;
const FPS = 20;
const SECONDS = 20;
const PIXEL_NOISE = 30;
const MAX_CHANGED_RATIO = 0.03;
const FONT_RASTER_BLUR = 1;
// One physical screen pixel is one third of a recording pixel; allow font raster rounding only.
const RASTER_OFFSETS = [0, -1 / 3, 1 / 3];

/** Record layout changes, then compare the unchanged file-card title in every displayed frame. */
export async function recordStreamingPosition({ name, title, start }) {
  const video = path.join(output, `${name}.mp4`);
  const remote = `/sdcard/${name}.mp4`;
  const recording = spawn('adb', ['-s', serial, 'shell', 'screenrecord', '--size', `${WIDTH}x${HEIGHT}`,
    '--bit-rate', '4000000', '--time-limit', String(SECONDS), remote], { windowsHide: true });
  const finished = new Promise((resolve, reject) => {
    recording.on('error', reject);
    recording.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Recording failed: ${code}`)));
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await start();
  } finally {
    await finished;
    await adb('pull', remote, video);
  }
  const rect = title.map((coordinate) => Math.round(coordinate / 3));
  const { stdout } = await exec('ffmpeg', ['-v', 'error', '-i', video,
    '-vf', `fps=${FPS},gblur=sigma=${FONT_RASTER_BLUR}`,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
  { encoding: 'buffer', maxBuffer: 150 * 1024 * 1024, windowsHide: true });
  const frameSize = WIDTH * HEIGHT;
  const reference = stdout.subarray(stdout.length - frameSize);
  const frames = [];
  for (let index = 0; index < stdout.length / frameSize; index++) {
    const frame = stdout.subarray(index * frameSize, (index + 1) * frameSize);
    const ratio = Math.min(...RASTER_OFFSETS.map((offset) => changedRatio({ frame, reference, rect, offset })));
    frames.push({ timeMs: index * 1000 / FPS, changedRatio: ratio });
  }
  const shifted = frames.filter((frame) => frame.changedRatio > MAX_CHANGED_RATIO);
  const result = { name, rect, frames: frames.length, shifted };
  await writeFile(path.join(output, `${name}-frames.json`), JSON.stringify(result, null, 2));
  assert.ok(frames.length > FPS * 10, 'Continuous streaming was recorded');
  assert.equal(shifted.length, 0, 'Streaming does not shift the unchanged file card for even one frame');
  return result;
}

function changedRatio({ frame, reference, rect: [left, top, right, bottom], offset }) {
  let changed = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = y * WIDTH + x;
      const referenceY = Math.floor(y + offset);
      const fraction = y + offset - referenceY;
      const target = reference[referenceY * WIDTH + x] * (1 - fraction)
        + reference[(referenceY + 1) * WIDTH + x] * fraction;
      if (Math.abs(frame[index] - target) > PIXEL_NOISE) changed++;
    }
  }
  return changed / ((right - left) * (bottom - top));
}
