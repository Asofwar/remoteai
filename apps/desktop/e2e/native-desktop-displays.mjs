import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const endpoints = JSON.parse(process.env.CSW_NATIVE_DISPLAY_ENDPOINTS || '[]');
assert.equal(endpoints.length, 2);
assert.ok(endpoints.every(item => item.endpoint.startsWith('http://127.0.0.1:') && item.token));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.exposeFunction('nativeRequest', async (index, path, body = {}) => {
    const { endpoint, token } = endpoints[index];
    const reply = await fetch(`${endpoint}${path}`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Desktop-Test': token,
    }, body: JSON.stringify(body) });
    if (!reply.ok) throw new Error(`Native display request failed: ${reply.status}`);
    return reply.json();
  });
  const result = await page.evaluate(async () => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function connect(index) {
      const peer = new RTCPeerConnection();
      const video = document.createElement('video'); video.muted = true; video.autoplay = true;
      // Keep both surfaces visible so Chromium does not suspend rendering an offscreen video.
      video.width = 320; video.height = 180;
      document.body.append(video);
      const candidates = [], heartbeats = [];
      peer.ontrack = ({ streams }) => { video.srcObject = streams[0]; };
      peer.onicecandidate = ({ candidate }) => { if (candidate) candidates.push(candidate.toJSON()); };
      peer.ondatachannel = ({ channel }) => {
        channel.onopen = () => {
          channel.send('{"kind":"ping"}');
          heartbeats.push(setInterval(() => {
            if (channel.readyState === 'open') channel.send('{"kind":"ping"}');
          }, 1000));
        };
      };
      const offer = await window.nativeRequest(index, '/offer');
      await peer.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer);
      let sdp = answer.sdp;
      const deadline = performance.now() + 20_000;
      while (performance.now() < deadline) {
        const reply = await window.nativeRequest(index, '/signal', { answer: sdp, candidates: candidates.splice(0) });
        sdp = undefined;
        for (const candidate of reply.candidates) await peer.addIceCandidate(candidate);
        if (video.videoWidth > 0) return { peer, video, heartbeats };
        await delay(150);
      }
      throw new Error('Native display failed to connect');
    }
    const displays = await Promise.all([connect(0), connect(1)]);
    const profile = fps => ({ width: 1280, fps, bitrate: 2_000_000 });
    const frames = () => displays.map(({ video }) => video.getVideoPlaybackQuality().totalVideoFrames);
    await window.nativeRequest(0, '/profile', profile(1));
    await delay(2000);
    const before = frames(); await delay(5000);
    const background = frames().map((value, index) => value - before[index]);
    const states = displays.map(({ peer }) => peer.connectionState);
    await window.nativeRequest(1, '/profile', profile(1));
    await window.nativeRequest(0, '/profile', profile(30));
    await delay(2000);
    const switchedBefore = frames(); await delay(5000);
    const switched = frames().map((value, index) => value - switchedBefore[index]);
    await window.nativeRequest(1, '/close');
    const remainingBefore = frames()[0]; await delay(3000);
    const remaining = frames()[0] - remainingBefore;
    const retainedState = displays[0].peer.connectionState;
    displays.forEach(({ peer, heartbeats }) => { heartbeats.forEach(clearInterval); peer.close(); });
    return { background, switched, states, remaining, retainedState };
  });
  console.log(JSON.stringify(result));
  assert.deepEqual(result.states, ['connected', 'connected']);
  // Damage-aware capture may send fewer frames on a static screen, but never a full-rate background.
  assert.ok(result.background[0] >= 1 && result.background[0] <= 7);
  assert.ok(result.background[1] >= 1);
  assert.ok(result.switched[0] >= 1);
  assert.ok(result.switched[1] >= 1 && result.switched[1] <= 7);
  assert.equal(result.retainedState, 'connected'); assert.ok(result.remaining >= 1);
} finally { await browser.close(); }
