# Russian localization

Desktop, web, Android and iOS support Chinese, English and Russian (Русский). Native apps offer the language selector on the login screen and in Settings, save the choice in secure storage, and restore it before showing the app. Native apps initially follow Chinese, English or Russian system locales; other locales default to Chinese. Desktop and web retain their previous default, with Russian selected for Russian system/browser locales. A saved choice always takes precedence.

Coverage includes desktop navigation, accounts, providers, token usage, settings, themes, plugins, conversation controls, permissions, scheduled tasks, terminal actions, configuration labels, tray actions and the user agreement. Native coverage includes login, accounts, devices, chat and its tools, remote desktop controls, downloads, 2FA, settings and updates. Web uses the shared interface dictionaries and matching component-library locales, with narrow mobile and desktop layouts checked.

Conversation messages, code, file paths, model identifiers, permissions and request values remain unchanged. Language changes update mounted views without remounting chat or reconnecting it. Command search retains its original aliases. Translation dictionaries are bundled with the application; no external translation service is used at runtime. The standalone admin interface and backend are outside this change.

The review of `bbbc02617b7c4bf8c7cbfcea58ffa1bfe579ad62` also fixes inherited-property dictionary lookups, repeated interpolation of inserted values, stale memoized chat/diff labels, the Russian settings badge, image-editor document language and language broadcasts when browser storage is unavailable. Desktop language persistence runs off the Windows UI thread and writes only `interface-language.json`, so it cannot overwrite concurrent account/proxy settings. Existing `settings.json` language values remain the fallback until an explicit save.

## Maintenance

- Desktop keys: apps/desktop/src/i18n/ru/.
- Shared GUI/web/native source strings: shared/i18n/en/ and shared/i18n/ru/. Mobile additions are grouped in mobile*.ts.
- Shared language store and safe interpolation: shared/i18n/interfaceLanguage.ts and shared/i18n/translate.ts.
- Native preference persistence: apps/native/src/i18n/preference.ts. Keep startup reads from overwriting newer choices and serialize writes.
- User agreement: shared/legal/ru.ts.
- Use guiText/t only for application copy, never user or assistant content. Subscribe rendered consumers to language changes; do not use translated values as protocol identifiers or state comparisons.
- Preserve boundary spaces in fragments, and prefer complete messages with placeholders. Interpolate once so user values containing braces or replacement tokens stay intact.

### Coze editor

The Coze editor (`apps/coze/ui`) ships in the separately signed Coze runtime package, not in the desktop app. It has its own dictionaries and does not import the shared ones: they are large, and some short shared keys mean something else in Coze (`应用` is "Apply" there, but "App" in Coze).

- Dictionaries: `apps/coze/ui/src/i18n/en/<area>.ts` and `apps/coze/ui/src/i18n/ru/<area>.ts`, keyed by the Chinese source string. `i18n/index.ts` merges them with `import.meta.glob`, so a new area needs no aggregator edit. Resource kind names with their plural and gender forms are in `i18n/kinds.ts`. Chinese output is the source text itself.
- Wrap copy in `t()`. Use `msg()` for Chinese text that is stored now and translated where it is displayed (error state, constants), and `verbatim()` for protocol values and classifier patterns. Rust runtime messages reach the editor in Chinese and are translated at render time; `api()` and `errorText()` never translate. Default data (node names, prompts, sample values) is localized once, when it is created.
- `i18n/coverage.test.ts` requires en and ru entries for every `t()` and `msg()` literal, matching placeholders, no Han characters in translations and no Chinese literal outside `t()`, `msg()` or `verbatim()`. Coze unit tests run in the zh-CN locale (`shared/i18n/testLocale.ts`).
- Language source: the runtime serves the editor on a new random port at each start, so browser storage in the editor does not persist. The desktop appends `lang=<zh|en|ru>` to the iframe URL fragment once per runtime URL, and the editor keeps it in sessionStorage `coze-language`. Live changes arrive in the `language` field of the `remoteai:coze:state` bridge message (`CozeDesktopState` in `shared/coze/desktopBridge.ts`), so the iframe does not reload and drafts survive. Without either (access links opened in a browser, older desktop builds), `deviceLanguage()` decides: Chinese locales get Chinese, all others English. The antd locale and the document language follow the selected language.
- Release: editor and Rust changes reach users only with a new signed Coze runtime release. Bump `apps/coze/Cargo.toml`, `apps/coze/Cargo.lock`, `apps/coze/package.json` and `apps/coze/runtime.json` together (tag `coze-v<version>`), publish the release with `.github/workflows/coze-runtime.yml`, and ship a desktop build that embeds the new `runtime.json`. Until then, desktop builds download `coze-v0.2.2`, whose editor is Chinese only. Older runtimes ignore the `lang` fragment parameter and the extra bridge field.
- Verification: in `apps/coze`, run `npx vitest run` and `npx tsc -p ui/tsconfig.json --noEmit`; run the Playwright specs with `npm run test:e2e -w @codex-switch/coze`. The Coze README is available in [English](../apps/coze/README_EN.md) and [Russian](../apps/coze/README_RU.md).

## Verification

- Run native `check` and `test`, desktop `build` and `test`, and web `check`. Native tests cover dictionary completeness, placeholder parity, data preservation, preference races and write failures.
- Run Rust formatting, tests and strict Clippy for desktop changes.
- Web Playwright `i18n.pw.ts` checks all three languages, persistence, cross-tab updates, blocked storage and 320px/390px/desktop layouts. `i18n-chat.pw.ts` checks draft and connection preservation and localized chat settings.
- `apps/desktop/e2e/android-i18n-regression.mjs` runs against the local mobile fixture and a separate regression APK. It checks login, language changes, draft/connection preservation, sending and restart persistence. Set `ANDROID_CHAT_PACKAGE=com.codexswitch.mobile.regressiontest`, `ANDROID_CHAT_APK`, `ANDROID_SERIAL` and `CHAT_TEST_API_PORT` to the isolated fixture values.
- Build Android and export iOS resources. An iOS export validates bundling; it does not replace an iOS device check.
