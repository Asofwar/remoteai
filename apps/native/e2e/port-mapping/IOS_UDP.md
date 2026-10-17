# iOS UDP empty reply regression

The CocoaAsyncSocket 7.6.5 send path ignores empty data, then also treats a zero-byte
`sendto` result as pending. Both checks must be patched. `withIosUdp.cjs` reapplies
the reviewed patch after every CocoaPods install; an unreviewed version fails the build.
The native adapter uses a finite send timeout, and the forwarding batch also rejects
on timeout or socket closure so the mapping cannot remain silently stuck.

On macOS with Xcode and an available iPhone simulator, run:

```sh
node apps/native/scripts/test-ios-udp.cjs
```

This compiles the installed `UdpSocketClient.m` and patched CocoaAsyncSocket source,
then uses two real loopback UDP peers. Each peer receives an empty reply followed by
ordinary replies. The check verifies native send callbacks, payloads, destination
isolation, and the mapping's source port on macOS and the iOS simulator. It does not
replace verification of the signed application on a physical iPhone.

Physical iPhone release check:

1. Rebuild the iOS app after installing Pods. A JavaScript-only update cannot apply this fix.
2. Start a UDP mapping to a test server that returns an empty reply for `empty` and echoes
   other payloads unchanged.
3. From two local UDP clients with different source ports, send `empty`, then at least
   20 numbered ordinary datagrams per client. Repeat over direct and relay connections.
4. Confirm both clients receive empty replies and all subsequent payloads from the
   configured mapping port, with no packets delivered to the other client.
5. Stop the mapping during traffic, restart it, and confirm forwarding resumes. A lost
   native callback must report failure within 10 seconds instead of leaving the mapping running.

Windows validation covers shared client behavior, Node socket integration, timeout/close
handling, and patch application. Record physical device results separately; these checks
do not establish that a real iPhone has passed.
