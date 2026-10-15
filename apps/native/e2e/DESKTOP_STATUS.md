# Remote desktop status text on Android

Connect a physical Android phone with USB debugging enabled. This fixture renders
the production `RemoteDesktop` component using local, pending connection and Mac
permission responses. It tests native text layout, not remote video transport.
Its separate application ID, `com.codexswitch.mobile.desktopstatustest`, preserves
the installed app and account data.

From the repository root in PowerShell, with Java 17, Rust and the Android SDK configured:

```powershell
$env:PATH = "$HOME\.cargo\bin;$env:JAVA_HOME\bin;$env:PATH"
$env:NODE_ENV = 'production'
$env:NODE_PATH = (Resolve-Path apps/native/node_modules).Path
$env:ANDROID_SERIAL = '<serial from adb devices -l>'
Push-Location apps/native/android
.\gradlew.bat assembleRelease -I ../e2e/desktop-status.init.gradle -PreactNativeArchitectures=arm64-v8a
Pop-Location
node apps/native/e2e/desktop-status-test.mjs
```

The runner checks the connection message, retry action and multiline permission
guidance in portrait and landscape at system font scales 1.0 and 1.3. It verifies
minimum text height, compact width, nonoverlap and screen containment, and taps
retry before repeating the connection check. Minimum height comes from a native
reference label, allowing Android's nonlinear font scaling rather than assuming
that scaled pixels are proportional to the font-scale setting. The original font scale is restored
in `finally`, and the installed production app is reopened.

Inspect the PNGs in `.codex-tmp/desktop-status/fixed/` for complete bottom strokes;
view bounds alone cannot establish that every glyph renders correctly. The same
directory contains `result.json` with device and layout measurements. Use
`--baseline` before applying a style fix to capture the original measurements
without enforcing the new minimum text height.

Web coverage for narrow portrait, landscape and desktop layouts:

```powershell
npm run test:remote-desktop:e2e -w @codex-switch/web -- remote-desktop-status.pw.ts --project=portrait --project=landscape --project=desktop
```
