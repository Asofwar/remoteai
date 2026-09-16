import { describe, expect, it } from "vitest";
import type { Translate } from "../../i18n";
import { validateProxy } from "./networkProxyValidation";

const t: Translate = (key) => key;
const settings = { enabled: true, proxyUrl: "http://127.0.0.1", proxyPort: 1080 };

describe("network proxy settings", () => {
  it.each(["http", "https", "socks4", "socks4a", "socks5", "socks5h"])(
    "accepts %s proxy addresses with a separate port", (scheme) => {
      expect(validateProxy({ ...settings, proxyUrl: `${scheme}://127.0.0.1` }, t)).toBeNull();
      expect(validateProxy({ ...settings, proxyUrl: `${scheme}://[::1]/` }, t)).toBeNull();
    },
  );

  it.each(["127.0.0.1", "file:///proxy", "ftp://localhost", "socks5://localhost/path",
    "socks5://localhost?test=1", "socks5://localhost#proxy", "socks5://localhost:1080"])(
    "rejects invalid or ambiguous address %s", (proxyUrl) => {
      expect(validateProxy({ ...settings, proxyUrl }, t)).toBe("settings.networkProxy.invalidAddress");
    },
  );

  it.each([0, -1, 65_536, 1.5, null])("rejects invalid port %s", (proxyPort) => {
    expect(validateProxy({ ...settings, proxyPort }, t)).toBe("settings.networkProxy.invalidPort");
  });

  it("allows disabling an incomplete proxy", () => {
    expect(validateProxy({ enabled: false, proxyUrl: "", proxyPort: null }, t)).toBeNull();
  });
});
