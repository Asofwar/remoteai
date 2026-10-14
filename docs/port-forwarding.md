# Remote port mapping

In a remote computer's desktop chat workspace, **端口映射** appears immediately to the left of
**远程桌面**. Add a remote port and a local port, then choose **添加并启动**. Leaving the local port blank
uses the remote port number. For example, remote port `3000` and local port `13000` make the remote
service available at `127.0.0.1:13000` on the viewing computer.

Click a running mapping's local address to choose **在 Remote AI 中预览** or **在浏览器中打开**.
Both actions open `http://127.0.0.1:<local port>` through the existing mapping. The preview uses the
shared details drawer and retains the local address in its navigation history. Stopped mappings
cannot be opened. These actions are intended for HTTP services; copying remains available for other TCP clients.

Each computer supports up to eight saved mappings. Mappings can be started, stopped, deleted and
copied independently. Settings are stored locally and separated by server, account and remote device.
Switching chat threads or projects keeps active mappings running. On desktop, switching computers also keeps them running.
On mobile and Web, switching computers stops the previous computer's mappings. Disconnecting or signing out
releases listeners and remote resources; saved mappings require a manual start after reconnection
or application restart. A local port already used by another process or mapping cannot be reused.

This feature supports TCP services listening on the remote computer's IPv4 loopback interface.
The viewer binds only `127.0.0.1`; it does not expose mapped ports to other devices. UDP and custom
remote host addresses are outside the current scope.

## Phone app

Open **工具 → 端口映射**. Add a remote port and an optional local port. The phone binds only its own
`127.0.0.1`; tapping a running address opens an isolated WebView, with back, refresh and
**在浏览器中打开** controls. Stopping a mapping releases its listener and accepted connections.
The TCP server adapter waits for native close acknowledgement before allowing the port to be reused.

Android retains a foreground service while any mapping is active, with a **端口映射** notification.
Mapping leases are independent of background chat. The service adds the `connectedDevice` type while
mapping, and removes it after the last mapping stops. Start is allowed only while the app is visible;
the listener remains active after opening an external browser. This requires a newly built APK.
Force-stopping the app, signing out, or losing the remote connection stops mappings.

iOS supports the same listener and in-app preview. An external browser can be opened, but iOS may
suspend the app in the background. The UI recommends the in-app preview for this reason.

## Web preview

Web exposes **工具 → 端口映射**, with add, start, stop and remove actions. It accepts a remote HTTP port;
the displayed address identifies the service on that computer. Clicking it opens the internal preview.
Web does not bind a local TCP port or present a browser-open/copy action that would target the viewer's machine.

The preview uses the authenticated resource protocol to fetch HTTP/1 responses and a bounded resource
graph, including styles, images, JavaScript modules, fetch/XHR calls and WebSocket connections. HTTP
headers, content-length and chunked framing are parsed without sending the host page's cookies.
Navigation, refresh and URL-encoded form submissions remain scoped to the mapped loopback origin.
The sandbox has an opaque origin, no access to account storage, and a CSP that blocks direct network
requests; a private MessageChannel provides only the selected mapping's operations.

This is an embedded preview, not a full browser proxy: other origins, service workers, browser storage,
streaming HTTP responses, computed module imports and browser-location-dependent routing are not emulated.
Use the native app's TCP mapping for pages that require those browser capabilities. Each response is
limited to 20 MiB, and one document's resource graph to 128 resources / 50 MiB.

## Transport and lifecycle

The viewers reuse `guiResourceOpen`, `guiResourceLink` and `guiResourceClose` over the selected
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
- `e2e/port-forwarding.pw.ts` covers form actions, preview/browser opening, copying, errors, reconnects, device switching,
  persistence and compact light/dark layouts; `e2e/remote-gui.pw.ts` verifies the real workspace entry.
- Native `portMapping` tests cover real TCP/HTTP transfer, binary bytes, port conflicts, reuse and background leases.
- Web `playwright.port-mapping.config.ts` tests a real HTTP/WebSocket fixture on mobile and desktop viewports,
  including resource loading, module imports, API requests, navigation, forms and account-storage isolation.
- Android hardware verification (2026-10-15): over P2P to a paired Windows 11 VM, remote loopback `17631`
  mapped to phone loopback `17632`. In-app preview, external Mi Browser opening and background refresh,
  copying, stopping and immediately restarting the same port passed. Foreground service type changed from
  `remoteMessaging|connectedDevice` to `remoteMessaging` after the mapping stopped.
