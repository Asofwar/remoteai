# Chrome Web Store review instructions

The extension's local browser tools can be reviewed without an AI account or model API key.
The optional chat in the side panel uses the existing Remote AI Web account and connected device.
Use a desktop version of Chrome (125 or later) on Windows, macOS, or Linux.

## Install the companion application

1. Download and install [Remote AI 1.5.23](https://github.com/piperhex/remoteai/releases/tag/v1.5.23).
   Earlier desktop versions do not recognize the Chrome Web Store extension ID.
2. Open Remote AI and select a Codex Home directory. If none exists, add a directory in Settings.
3. Open the community plugins page (社区插件), find **Chrome 浏览器助手**, and click **安装**.
   If already installed, enable it or use **修复** when offered.
4. Install the extension under review in Chrome. Its store ID is
   `ocngjhjonejkndmlkjmbgjdlghkdhpjj`.
   The desktop setup dialog also describes an unpacked installation option; skip that option when
   reviewing the store package. Only one copy of the extension is needed.
5. Click the extension icon to open the side panel. Open **浏览器助手设置** in its toolbar and
   confirm **已连接**. If necessary, use its reconnect control. Settings do not require chat sign-in.

## Side panel

Clicking the extension icon opens Chrome's native side panel alongside the current page; the page
retains its own scrollbar. The panel embeds `https://codex.onepiper.cloud/web/` in a sandboxed,
cross-origin iframe. It reuses Remote AI's mobile Web interface and account flow. Remote scripts
have no access to extension APIs and cannot grant website permissions or control tabs directly.
Only bundled local settings pages can send permission-management messages to the extension.
Use the toolbar to switch between chat and settings, reload chat, or open it in a normal tab.
Switching views preserves the chat document. Check narrow and wider panel sizes for independent scrolling.

## Test without an AI account

Use [MCP Inspector](https://github.com/modelcontextprotocol/inspector), an independent MCP testing tool.
Node.js is needed for Inspector, but is not required by the extension or its desktop connection.

1. In the selected Codex Home directory, open `config.toml` and find
   `[mcp_servers.codex_switch_chrome]`.
2. Copy only that entry's `command` and `args` into a new `chrome-review.json` file:

   ```json
   {
     "mcpServers": {
       "codex_switch_chrome": {
         "type": "stdio",
         "command": "REPLACE_WITH_INSTALLED_EXECUTABLE_PATH",
         "args": ["--chrome-mcp=REPLACE_WITH_GENERATED_CLIENT_ID"]
       }
     }
   }
   ```

   Use the exact generated values. Escape Windows backslashes in JSON, or use forward slashes.
   No API key, browser cookie, or account credential is needed in this file.
3. Start Inspector with `npx @modelcontextprotocol/inspector --config chrome-review.json`,
   open the local URL it prints, and connect to `codex_switch_chrome`.
4. List the tools and call `browser_list` with `{}`. Use the returned `browserId` for your test profile.
5. Call `browser_open` with that ID, `url` set to `https://example.com`, and `background` set to `true`.
   Expect a new background tab in a green **Remote AI** group. Use its returned `tabId` in later calls.
6. Call `browser_snapshot` and `browser_screenshot` with `browserId` and `tabId`.
   Expect the Example Domain page text and an image. A green cursor favicon marks the controlled tab.
7. To test clicking, take a fresh snapshot, then call `browser_click` with the link's returned `ref`.
   To test input, open a test page containing a text field, take a fresh snapshot, and use
   `browser_fill` with that field's returned `ref` and your test text. Inspector shows each tool's schema.
8. Pause control in the side panel's browser settings. A subsequent page operation should be rejected.
   Resume it, switch to per-site confirmation, and try a new website. Grant access in the approval window
   to continue; declining or leaving the request unanswered must not grant access.
9. Call `browser_finish` with `browserId` and the test tabs' `tabIds`. Temporary tabs and empty groups
   should close, and debugging should end. Existing user tabs stay open. To retain a test page,
   also include it in `keepTabIds`.

Normal AI use runs the same tools from a new Codex conversation after enabling the plugin.
The assistant instructions require new background tabs in a Remote AI group unless the user explicitly
requests an already-open page. An explicitly selected existing page stays in its original group.

The extension sends results to the local companion application. In the Inspector flow above,
no model service is involved. With an AI client, task data may be sent to the model provider chosen
by the user, as described in the [privacy policy](chrome-extension-privacy.md).
