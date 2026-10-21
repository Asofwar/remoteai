import { guiLanguage } from "../../i18n/guiText";
import type { Language } from "../../../../../shared/i18n/language";
import type { MenuSnapshot } from "./types";

// Accounts header labels written by system_tray.rs (build_menu) for each tray language.
const ACCOUNTS_HEADER_LANGUAGES = new Map<string, Language>([
  ["账号", "zh"],
  ["Accounts", "en"],
  ["Аккаунты", "ru"],
]);

/**
 * The quick menu runs in its own webview, so it follows the language of the tray menu it mirrors.
 * Before the first snapshot arrives (or if the header is unrecognised) it uses the stored GUI language.
 */
export function quickMenuLanguage(snapshot: MenuSnapshot | null): Language {
  const header = snapshot?.entries.find((entry) => entry.id === "tray:accounts-header");
  return (header && ACCOUNTS_HEADER_LANGUAGES.get(header.text)) || guiLanguage();
}
