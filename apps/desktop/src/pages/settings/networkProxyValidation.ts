import type { Translate } from "../../i18n";
import type { NetworkProxySettings } from "../../types";

const PROXY_PROTOCOLS = ["http:", "https:", "socks4:", "socks4a:", "socks5:", "socks5h:"];
const MAX_PORT = 65_535;
const DEFAULT_PROXY_URL = "http://127.0.0.1";

export function validateProxy(settings: NetworkProxySettings, t: Translate) {
  if (!settings.enabled) return null;
  const rawUrl = settings.proxyUrl.trim() || DEFAULT_PROXY_URL;
  try {
    const url = new URL(rawUrl);
    const pathIsEmpty = ["", "/"].includes(url.pathname) && !url.search && !url.hash;
    if (!PROXY_PROTOCOLS.includes(url.protocol) || !url.hostname || url.port || !pathIsEmpty) {
      return t("settings.networkProxy.invalidAddress");
    }
  } catch {
    return t("settings.networkProxy.invalidAddress");
  }
  if (!settings.proxyPort || !Number.isInteger(settings.proxyPort)
    || settings.proxyPort < 1 || settings.proxyPort > MAX_PORT) {
    return t("settings.networkProxy.invalidPort");
  }
  return null;
}
