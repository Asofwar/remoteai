# PC remote port forwarding

In a remote computer's desktop chat workspace, **端口转发** appears immediately to the left of
**远程桌面**. Add a remote port and a local port, then choose **添加并启动**. Leaving the local port blank
uses the remote port number. For example, remote port `3000` and local port `13000` make the remote
service available at `127.0.0.1:13000` on the viewing computer.

Each computer supports up to eight saved mappings. Mappings can be started, stopped, deleted and
copied independently. Settings are stored locally and separated by server, account and remote device.
Switching chat threads or computers keeps active mappings running. Disconnecting or signing out
releases listeners and remote resources; saved mappings require a manual start after reconnection
or application restart. A local port already used by another process or mapping cannot be reused.

This feature supports TCP services listening on the remote computer's IPv4 loopback interface.
The viewer binds only `127.0.0.1`; it does not expose mapped ports to other devices. UDP and custom
remote host addresses are outside the current scope. Browser and mobile clients do not create
local listeners and therefore do not show this desktop-only control.

## Transport and lifecycle

The desktop viewer reuses `guiResourceOpen`, `guiResourceLink` and `guiResourceClose` over the selected
computer's authenticated chat connection. P2P and Relay selection, encryption, retries and relay
traffic accounting are shared with the existing transport. No additional public listener or backend
route is needed. The resource URL identifies the remote TCP address; forwarding does not parse or
rewrite HTTP, TLS or other application bytes.

`TerminalLinkTunnels` accepts a fixed local port for manual mappings while retaining automatic port
allocation for previews. The asynchronous Rust listener command validates the requested port and
releases its bound socket before completing a stop, even with a pending accept. Manual mappings
share an eight-stream concurrency budget per computer to retain chat RPC capacity; additional local
connections are closed. A failed listener or disconnected session requires restarting its mapping.

## Verification

- Rust `gui_terminal::links` tests cover fixed-port conflicts and reuse, cancellation, independent
  listeners, scoped binary transfers and WebSocket forwarding.
- `portForwarding/service.test.ts` covers concurrent mappings, validation, startup cancellation,
  late replies, cleanup, retries and disconnects. Settings tests cover device isolation and corrupt data.
- `portForwarding/transport.test.ts` carries two byte streams through the existing encrypted transport
  while switching from P2P to Relay without restarting either mapping.
- `e2e/port-forwarding.pw.ts` covers form actions, copying, errors, reconnects, device switching,
  persistence and compact light/dark layouts; `e2e/remote-gui.pw.ts` verifies the real workspace entry.
