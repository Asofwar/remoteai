import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { ChatSessions } from '@/modules/devices/chat/chat-sessions';
import type { ChatIdentity } from '@/modules/devices/chat/protocol';

class Socket {
  readyState = 1;
  bufferedAmount = 0;
  sent: Record<string, unknown>[] = [];
  send(value: string, callback?: (error?: Error) => void) { this.sent.push(JSON.parse(value)); callback?.(); }
  close() { this.readyState = 3; }
  ws() { return this as unknown as WebSocket; }
}
function identity(role: ChatIdentity['role'], ownerId = 'owner'): ChatIdentity {
  return { role, ownerId, deviceId: 'pc', expiresAt: Date.now() + 120_000 };
}
function setup() {
  const sessions = new ChatSessions();
  const pc = new Socket();
  const phone = new Socket();
  sessions.join(pc.ws(), identity('desktop'), { transportVersion: 2 }, []);
  sessions.join(phone.ws(), identity('mobile'), { transportVersion: 2, publicKey: 'aa'.repeat(32) }, []);
  const { sessionId, resumeToken } = phone.sent[0];
  return { sessions, pc, phone, claim: { sessionId, resumeToken } };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => vi.useRealTimers());

it('negotiates v2 only with two capable endpoints and immediately permits encrypted standby traffic', () => {
  const { sessions, pc, phone, claim } = setup();
  expect(phone.sent[0]).toMatchObject({ transportVersion: 2, expiresAt: 220_000 });
  sessions.route(phone.ws(), { type: 'relay', sessionId: claim.sessionId, payload: 'ab' });
  expect(pc.sent.at(-1)).toMatchObject({ type: 'relay', payload: 'ab' });
  const legacy = new Socket();
  sessions.join(legacy.ws(), identity('mobile'), { publicKey: 'ab'.repeat(32) }, []);
  expect(legacy.sent[0].transportVersion).toBeUndefined();
  expect(() => sessions.route(legacy.ws(), { type: 'relay', sessionId: legacy.sent[0].sessionId, payload: 'ab' }))
    .toThrow();
});

it('detaches a failed socket, resumes the same session and rejects frames from the replaced socket', () => {
  const { sessions, pc, phone, claim } = setup();
  phone.close();
  sessions.disconnect(phone.ws());
  expect(pc.sent.at(-1)).toMatchObject({ type: 'peer-offline' });
  const next = new Socket();
  sessions.join(next.ws(), identity('mobile'), { transportVersion: 2, resume: claim }, []);
  expect(next.sent.at(-1)).toMatchObject({ type: 'resumed', sessionId: claim.sessionId });
  expect(pc.sent.at(-1)).toMatchObject({ type: 'resumed', sessionId: claim.sessionId });
  expect(() => sessions.route(phone.ws(), { type: 'relay', sessionId: claim.sessionId, payload: 'ab' })).toThrow();
  sessions.route(next.ws(), { type: 'relay', sessionId: claim.sessionId, payload: 'ab' });
  expect(pc.sent.at(-1)).toMatchObject({ type: 'relay' });
});

it('restores routing after coordinator restart only when both authenticated endpoints present matching proofs', () => {
  const { claim } = setup();
  const sessions = new ChatSessions();
  const pc = new Socket();
  const phone = new Socket();
  sessions.join(pc.ws(), identity('desktop'), { transportVersion: 2, sessions: [claim] }, []);
  expect(() => sessions.join(phone.ws(), identity('mobile'), {
    transportVersion: 2, resume: { ...claim, resumeToken: 'ff'.repeat(32) },
  }, [])).toThrow('proof');
  sessions.join(phone.ws(), identity('mobile'), { transportVersion: 2, resume: claim }, []);
  expect(phone.sent.at(-1)).toMatchObject({ type: 'resumed', sessionId: claim.sessionId });
  const other = new Socket();
  expect(() => sessions.join(other.ws(), identity('desktop', 'other'), {
    transportVersion: 2, sessions: [claim],
  }, [])).toThrow('proof');
});

it('revokes expired sessions, ignores their late frames and leaves other phone sessions alive', () => {
  const { sessions, pc, phone, claim } = setup();
  const second = new Socket();
  sessions.join(second.ws(), identity('mobile'), { transportVersion: 2, publicKey: 'ab'.repeat(32) }, []);
  sessions.route(phone.ws(), { type: 'peer-close', sessionId: claim.sessionId });
  expect(pc.sent.at(-1)).toMatchObject({ type: 'peer-close', sessionId: claim.sessionId });
  expect(() => sessions.route(pc.ws(), { type: 'relay', sessionId: claim.sessionId, payload: 'ab' })).not.toThrow();
  expect(second.sent.at(-1)?.type).toBe('paired');
  vi.advanceTimersByTime(120_001);
  sessions.prune();
  expect(second.sent.at(-1)?.type).toBe('peer-close');
});

it('keeps the phone limit during reconnects and revokes old sessions when the PC loses its session state', () => {
  const { sessions, pc, phone } = setup();
  phone.close();
  sessions.disconnect(phone.ws());
  for (let index = 0; index < 3; index++) {
    sessions.join(new Socket().ws(), identity('mobile'), { transportVersion: 2, publicKey: 'ab'.repeat(32) }, []);
  }
  const overflow = new Socket();
  sessions.join(overflow.ws(), identity('mobile'), { transportVersion: 2, publicKey: 'ab'.repeat(32) }, []);
  expect(overflow.readyState).toBe(3);
  sessions.join(new Socket().ws(), identity('desktop'), { transportVersion: 2 }, []);
  expect(pc.sent.filter((frame) => frame.type === 'peer-close')).toHaveLength(4);
});
