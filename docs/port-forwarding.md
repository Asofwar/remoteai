# Remote port mapping

In a remote computer's desktop chat workspace, **端口映射** appears immediately to the left of
**远程桌面**. Enter a **目标 IP**, remote port and local port, then choose **添加并启动**.
The IP is reached from the remote computer; leaving it blank uses `127.0.0.1` on that computer.
Both IPv4 and IPv6 literals are supported (IPv6 may be entered with or without brackets).
Leaving the local port blank
uses the remote port number. For example, remote port `3000` and local port `13000` make the remote
service available at `127.0.0.1:13000` on the viewing computer.
For a LAN service, target IP `192.168.1.20`, remote port `3000` and local port `13000` make
`192.168.1.20:3000`, as reached by the remote computer, available at the same local address.

Click a running mapping's local address to choose **在 Remote AI 中预览** or **在浏览器中打开**.
Both actions open `http://127.0.0.1:<local port>` through the existing mapping. The preview uses the
shared details drawer and retains the local address in its navigation history. Stopped mappings
cannot be opened. These actions are intended for HTTP services; copying remains available for other TCP clients.

Each computer supports up to eight saved mappings. Mappings can be started, stopped, edited, deleted and
copied independently. Phone, Web and desktop automatically sync settings for the same signed-in account and
remote computer. A local cache keeps settings available offline. Editing a running mapping closes its old
listener before restarting with the new IP and ports; editing a stopped mapping leaves it stopped.
Switching chat threads or projects keeps active mappings running. On desktop, switching computers also keeps them running.
On mobile and Web, switching computers stops the previous computer's mappings. Disconnecting or signing out
releases listeners and remote resources; saved mappings require a manual start after reconnection
or application restart. A local port already used by another process or mapping cannot be reused.

This feature supports TCP services at IP addresses reachable from the remote computer.
The viewer binds only `127.0.0.1`; it does not expose mapped ports to other devices. UDP and custom
DNS hostnames are outside the current scope. Enter an IP only, without a URL scheme or port;
unspecified addresses (`0.0.0.0` and `::`) are not connection targets. Older saved mappings keep
their original `127.0.0.1` destination.

## Phone app

Open **工具 → 端口映射**. Add a target IP, remote port and an optional local port. The phone binds only its own
`127.0.0.1`; tapping a running address or its **打开** label shows **在 Remote AI 中预览** and
**在浏览器中打开**. Either option can be chosen directly from the mapping list. The in-app preview
uses an isolated WebView with back, refresh and browser controls. Stopping a mapping releases its listener and connections.
The TCP server adapter waits for native close acknowledgement before allowing the port to be reused.
The sheet groups mappings into cards with an on/off switch, address/open controls, target details and last-edited time.
Use a card's **更多操作 → 编辑映射** to change it in place, or **删除映射** to remove it. Cancel discards the form draft.
The list can be sorted by last-edited time. Desktop exposes a pencil button beside each mapping.

Android retains a foreground service while any mapping is active, with a **端口映射** notification.
Mapping leases are independent of background chat. The service adds the `connectedDevice` type while
mapping, and removes it after the last mapping stops. Start is allowed only while the app is visible;
the listener remains active after opening an external browser. This requires a newly built APK.
Force-stopping the app, signing out, or losing the remote connection stops mappings.

iOS supports the same listener and in-app preview. An external browser can be opened, but iOS may
suspend the app in the background. The UI recommends the in-app preview for this reason.

## Web preview

Web exposes **工具 → 端口映射**, with add, edit, start, stop and remove actions. It accepts a target IP and HTTP port;
the displayed address identifies the service reached from that computer. Clicking it opens the internal preview.
Different IPs can use the same port and remain independent, including after saved settings are restored.
Web does not bind a local TCP port or present a browser-open/copy action that would target the viewer's machine.
The local-port field is retained and synced for the phone and desktop apps; Web still previews the target address.

## Configuration synchronization

Deploy `apps/admin-go/sql/20261015-port-mappings.sql` before updating admin-go, then update the clients.
Fresh databases include the identical `015_port_mappings.sql` migration. The authenticated
`GET/PUT /devices/:deviceId/port-mappings` endpoint checks device ownership and is covered by the existing
Kong `/devices` JWT route (`strip_path: false`). No public route or new mapping listener is needed.
The configuration table is keyed by owner and remote device, and cascades when that device is removed.

Clients sync immediately after configuration changes and poll every five seconds while that computer's
workspace is mounted. Requests are single-flight and stop on unmount/sign-out. Offline edits and deletions
are persisted and retried. Stable IDs and revision-checked writes merge unrelated concurrent changes without
replacing the whole collection with stale local data. After a revision conflict the client fetches again and
reapplies only its pending edits; for the same mapping, the last accepted edit wins. Unchanged old caches do
not resurrect deleted mappings. Identical legacy local settings are imported once.

Only IPs, ports, IDs and edit timestamps sync. Listener state remains local: a newly received mapping is stopped;
an already-running mapping applies remote edits by restarting locally. Remote deletion stops its local listener.
Unavailable/older servers show a retry notice while local mapping continues to work. Configuration sync needs
the new server and client versions; this source change does not deploy the migration or install updated apps.

The preview uses the authenticated resource protocol to fetch HTTP/1 responses and a bounded resource
graph, including styles, images, JavaScript modules, fetch/XHR calls and WebSocket connections. HTTP
headers, content-length and chunked framing are parsed without sending the host page's cookies.
Navigation, refresh and URL-encoded form submissions remain scoped to the selected IP and port.
The sandbox has an opaque origin, no access to account storage, and a CSP that blocks direct network
requests; a private MessageChannel provides only the selected mapping's operations.

This is an embedded preview, not a full browser proxy: other origins, service workers, browser storage,
streaming HTTP responses, computed module imports and browser-location-dependent routing are not emulated.
Use the native app's TCP mapping for pages that require those browser capabilities. Each response is
limited to 20 MiB, and one document's resource graph to 128 resources / 50 MiB.

## Transport and lifecycle

The viewers reuse `guiResourceOpen` and `guiResourceClose` over the selected computer's authenticated
chat connection. New mobile/Web clients negotiate `portStreamsV1` with the host, then use
`guiResourceStream` only to open/close a TCP socket. Bytes flow continuously on the existing encrypted
binary channel (native direct stream, WebRTC data channel, or CSF1 server relay), independently of
chat RPC framing. No additional public listener or backend route is needed. The resource URL identifies
the permitted remote TCP address; the native TCP forwarding path preserves application bytes.

Each socket has independent offsets, a 2 MiB window per direction, cumulative acknowledgements and
bounded retry storage. Acknowledgements replenish credit only after the consumer reads the bytes.
Late/out-of-order records are authenticated and deduplicated, and a P2P/relay switch retransmits only
unacknowledged bytes without reopening TCP. Records are at most 16 KiB and adapt to smaller negotiated
path limits. Stalled writes fail after 30 seconds. A link permits at most 24 stream handles, covering the
eight active requests, bounded idle connections and sockets awaiting cleanup. Resource/session closure
releases the remote sockets, ciphers, timers and native receive routes.

Hosts without `portStreamsV1`, or clients without an available binary path, retain `guiResourceLink`
compatibility forwarding. Android requires a rebuilt APK containing the duplex connectivity and
port-stream modules; an older APK keeps RPC forwarding. iOS uses bounded native IPC batches for mesh
transport and the shared binary implementation for RTC/relay. These changes require updating the host
and the viewer to obtain streaming performance; the compatibility path continues to work during rollout.

`TerminalLinkTunnels` accepts a fixed local port for manual mappings while retaining automatic port
allocation for previews. The asynchronous Rust listener command validates the requested port and
releases its bound socket before completing a stop, even with a pending accept. Manual mappings
share an eight-stream concurrency budget per computer to retain chat RPC and cleanup capacity. Additional
connections wait in FIFO order for up to 30 seconds instead of being closed as soon as the budget is full.
The desktop accepts at most one waiting socket per listener and leaves further connections in the TCP backlog.
Native sockets pause while waiting to preserve their initial request bytes. Web HTTP requests and WebSockets
use the same admission queue. Stopping a mapping cancels its queued connections without affecting other mappings.
A failed listener or disconnected session requires restarting its mapping.

The host's local socket bridge and compatibility RPC use a uniform 384 KiB read/write bound. The
desktop viewer's local `TerminalLinkTunnels` currently retains this compatibility path. The host returns
as soon as data is available and drains only immediately readable bytes; small replies and WebSockets
never wait for the larger buffer to fill.

Web additionally fetches independent scripts/styles/images concurrently while preserving document
execution/style order, reuses safe HTTP/1.1 connections (up to eight idle connections per computer,
four-second expiry), and requests gzip/deflate where supported. Both wire and decoded responses are
bounded. A stale reused socket is retried once only for GET/HEAD before any response bytes arrive;
POST is never replayed. Closing/navigating a preview cancels its active and queued HTTP requests.

## Verification

- `portForwarding/byteStream.test.ts`, `streamMux.test.ts`, `streamClient.test.ts` and
  `streamIntegration.test.ts` cover bounded credit, cancellation, old-host fallback, encryption,
  replay/forgery, shrinking path limits, concurrent upload/download, shared file/port transport and live P2P/relay switching.
  Real loopback HTTP/TCP plus the encrypted stream implementation at simulated 60 ms RTT transfers
  an 8 MiB HTTP body in roughly 0.9–1.2 seconds, with a path switch and one socket-open RPC. This is a
  controlled transport benchmark, not a WAN or phone-browser timing guarantee.
- `httpPerformance.test.ts` measures a document with 20 tiny images at 60 ms simulated RPC RTT:
  the original serial/close-per-request implementation took about 4.1 seconds; concurrent loading and
  connection reuse take about 0.7–1.0 seconds and use at most eight connections. This test also keeps
  the compatibility path covered. Browser tests verify asset/module order and sandbox isolation.
- Android `ANDROID_SERIAL=<device> node apps/native/scripts/test-port-streams.cjs` checks routing,
  ownership, queue limits, overflow cleanup, close/poll races and the duplex JNI entrypoint on hardware,
  without replacing the installed app. Build the arm64 APK/native library first. This is bridge-level
  device verification; full app WAN browsing and iOS device performance require separate measurement.
- For actual duplex JNI bytes, first run `cargo test --lib bulk::android_fixture::android_duplex_bridge_fixture
  -- --ignored --nocapture` in `crates/chat-connectivity`, then run the Android script above with `--duplex`.
  On 2026-10-15, the phone received and echoed 4 MiB in 1.24 seconds through an ADB loopback fixture;
  the host verified every byte before the phone reported success. This is not a public-network benchmark.

- Rust `gui_terminal::links` tests cover fixed-port conflicts and reuse, cancellation, independent
  listeners, scoped binary transfers and WebSocket forwarding.
- `portForwarding/service.test.ts` covers concurrent mappings, validation, startup cancellation,
  late replies, cleanup, retries and disconnects. Settings tests cover device isolation and corrupt data.
- `portForwarding/transport.test.ts` carries two byte streams through the existing encrypted transport
  while switching from P2P to Relay without restarting either mapping.
- `terminal/linkTunnelConcurrency.test.ts` transfers 24 concurrent HTTP responses over real loopback sockets
  while keeping an upgraded connection and chat RPC available, and checks cancellation and immediate port reuse.
- `terminal/linkTunnelLatency.test.ts` compares 48/384 KiB read sizes with a 1.5 MiB HTTP asset and 60 ms simulated
  RPC RTT: 33 reads / about 2.3 s versus 5 reads / about 0.45 s. This measures tunnel overhead, not a live site's load time.
  Rust chunk tests verify immediate small responses, large binary transfers and size validation;
  transport tests carry the larger chunks through encryption and P2P/Relay switching.
- `portForwarding/streamBudget.test.ts` covers FIFO admission, cancellation, bounded waiting and slot reuse.
- `e2e/port-forwarding.pw.ts` covers form actions, preview/browser opening, copying, errors, reconnects, device switching,
  persistence and compact light/dark layouts; `e2e/remote-gui.pw.ts` verifies the real workspace entry.
- Native `portMapping` tests cover real TCP/HTTP transfer, binary bytes, port conflicts, reuse and background leases.
- Web `playwright.port-mapping.config.ts` tests a real HTTP/WebSocket fixture on mobile and desktop viewports,
  including resource loading, module imports, API requests, navigation, forms and account-storage isolation.
- Android hardware verification (2026-10-15): over P2P to a paired Windows 11 VM, remote loopback `17631`
  mapped to phone loopback `17632`. In-app preview, external Mi Browser opening and background refresh,
  copying, stopping and immediately restarting the same port passed. Foreground service type changed from
  `remoteMessaging|connectedDevice` to `remoteMessaging` after the mapping stopped.
