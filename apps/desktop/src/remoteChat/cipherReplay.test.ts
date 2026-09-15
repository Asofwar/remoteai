import { expect, it } from 'vitest';
import { keyPair, SessionCipher } from '../../../../shared/remote-chat/cipher';

function pair() {
  const sender = keyPair((size) => crypto.getRandomValues(new Uint8Array(size)));
  const receiver = keyPair((size) => crypto.getRandomValues(new Uint8Array(size)));
  return { sender: new SessionCipher({ sessionId: 'test', desktop: true,
    secret: sender.secret, publicKey: receiver.publicKey }),
  receiver: new SessionCipher({ sessionId: 'test', desktop: false,
    secret: receiver.secret, publicKey: sender.publicKey }) };
}

it('rejects replays across ring wraps while accepting unseen out-of-order packets inside the window', () => {
  const cipher = pair();
  const packets = Array.from({ length: 2200 }, (_, index) => cipher.sender.encrypt(String(index + 1)));
  expect(cipher.receiver.decrypt(packets[1023])).toBe('1024');
  expect(cipher.receiver.decrypt(packets[0])).toBe('1');
  expect(cipher.receiver.decrypt(packets[1024])).toBe('1025');
  expect(cipher.receiver.decrypt(packets[0])).toBeNull();
  expect(cipher.receiver.decrypt(packets[2])).toBe('3');
  expect(cipher.receiver.decrypt(packets[2])).toBeNull();
  expect(cipher.receiver.decrypt(packets[2199])).toBe('2200');
  expect(cipher.receiver.decrypt(packets[1175])).toBeNull();
  expect(cipher.receiver.decrypt(packets[1176])).toBe('1177');
  expect(cipher.receiver.decrypt(packets[2199])).toBeNull();
});

it('does not advance replay state when authentication fails', () => {
  const cipher = pair();
  const packets = Array.from({ length: 1100 }, () => cipher.sender.encrypt('valid'));
  const last = packets.at(-1)!;
  const corrupt = last.slice(0, -2) + (last.endsWith('00') ? '01' : '00');
  expect(() => cipher.receiver.decrypt(corrupt)).toThrow();
  expect(cipher.receiver.decrypt(packets[0])).toBe('valid');
  expect(cipher.receiver.decrypt(last)).toBe('valid');
  expect(cipher.receiver.decrypt(last)).toBeNull();
});
