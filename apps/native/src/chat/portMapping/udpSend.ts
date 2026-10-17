export const UDP_SEND_TIMEOUT_MS = 10_000;

interface SendSocket {
  once: (event: string, listener: (error?: Error) => void) => unknown;
  off: (event: string, listener: (error?: Error) => void) => unknown;
}

/** Native callbacks can disappear on shutdown or adapter failure; never leave the forwarding pump waiting. */
export function completeUdpSend(socket: SendSocket, send: () => Promise<unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      socket.off('close', closed);
      socket.off('error', failed);
      if (error) reject(error); else resolve();
    };
    const closed = () => finish(new Error('UDP listener closed'));
    const failed = (error?: Error) => finish(error ?? new Error('UDP send failed'));
    const timer = setTimeout(() => finish(new Error('UDP send timed out')), UDP_SEND_TIMEOUT_MS);
    socket.once('close', closed);
    socket.once('error', failed);
    try { void send().then(() => finish(), failed); } catch (error) { failed(error as Error); }
  });
}
