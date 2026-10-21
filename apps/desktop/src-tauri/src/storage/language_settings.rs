use std::{
    fs,
    path::Path,
    sync::atomic::{AtomicU8, Ordering},
};

use tauri::Runtime;

use super::{app_settings_path, write_json_atomic};
use crate::models::AppSettings;

const LANGUAGE_FILENAME: &str = "interface-language.json";

/// Interface language for text that Rust renders itself (notifications, native dialogs,
/// window titles, the OAuth callback page and proxy errors). Chinese is the canonical copy;
/// a missing or unknown preference keeps the existing Chinese behavior.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InterfaceLanguage {
    Zh,
    En,
    Ru,
}

impl InterfaceLanguage {
    fn from_setting(value: Option<&str>) -> Self {
        match value {
            Some("en") => Self::En,
            Some("ru") => Self::Ru,
            _ => Self::Zh,
        }
    }

    fn from_code(code: u8) -> Self {
        match code {
            1 => Self::En,
            2 => Self::Ru,
            _ => Self::Zh,
        }
    }

    fn code(self) -> u8 {
        match self {
            Self::Zh => 0,
            Self::En => 1,
            Self::Ru => 2,
        }
    }
}

/// Last language seen by `read_app_settings` or saved by `save_app_language`. Proxy and stream
/// threads read it without touching the settings files.
static CURRENT_LANGUAGE: AtomicU8 = AtomicU8::new(0);

fn remember_language(value: Option<&str>) {
    CURRENT_LANGUAGE.store(
        InterfaceLanguage::from_setting(value).code(),
        Ordering::Relaxed,
    );
}

/// Returns the saved interface language for Rust-rendered text.
#[cfg(not(test))]
pub(crate) fn interface_language() -> InterfaceLanguage {
    InterfaceLanguage::from_code(CURRENT_LANGUAGE.load(Ordering::Relaxed))
}

/// Tests share one process, and settings tests save every language. Keep the accessor on
/// Chinese unless the current test thread asks for another language.
#[cfg(test)]
pub(crate) fn interface_language() -> InterfaceLanguage {
    test_language::current()
}

/// Runs `action` with the interface language overridden on the current test thread only.
#[cfg(test)]
pub(crate) fn with_interface_language<T>(
    language: InterfaceLanguage,
    action: impl FnOnce() -> T,
) -> T {
    test_language::with(language, action)
}

#[cfg(test)]
mod test_language {
    use std::cell::Cell;

    use super::InterfaceLanguage;

    thread_local! {
        static OVERRIDE: Cell<Option<InterfaceLanguage>> = const { Cell::new(None) };
    }

    struct Restore(Option<InterfaceLanguage>);

    impl Drop for Restore {
        fn drop(&mut self) {
            OVERRIDE.with(|value| value.set(self.0));
        }
    }

    pub(super) fn current() -> InterfaceLanguage {
        OVERRIDE.with(Cell::get).unwrap_or(InterfaceLanguage::Zh)
    }

    pub(super) fn with<T>(language: InterfaceLanguage, action: impl FnOnce() -> T) -> T {
        let _restore = Restore(OVERRIDE.with(|value| value.replace(Some(language))));
        action()
    }
}

/// Keep the legacy value until a language is explicitly saved. An unreadable UI preference
/// must not prevent account, proxy or background operations from reading their settings.
pub(super) fn apply_saved_language(settings_path: &Path, settings: &mut AppSettings) {
    let saved = fs::read(settings_path.with_file_name(LANGUAGE_FILENAME))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<String>(&bytes).ok());
    if let Some(language) = saved.filter(|value| matches!(value.as_str(), "zh" | "en" | "ru")) {
        settings.language = Some(language);
    }
    remember_language(settings.language.as_deref());
}

/// Save only the interface preference; never write a stale snapshot of business settings.
/// This function is called by a blocking worker and uses atomic file replacement.
pub(crate) fn save_app_language<R: Runtime>(
    app: &tauri::AppHandle<R>,
    language: &str,
) -> Result<(), String> {
    if !matches!(language, "zh" | "en" | "ru") {
        return Err("Unsupported interface language".to_string());
    }
    let path = app_settings_path(app)?.with_file_name(LANGUAGE_FILENAME);
    write_json_atomic(&path, &serde_json::Value::String(language.to_string()))?;
    remember_language(Some(language));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_explicit_russian_or_english_leave_the_chinese_default() {
        for (value, expected) in [
            (None, InterfaceLanguage::Zh),
            (Some("zh"), InterfaceLanguage::Zh),
            (Some("en"), InterfaceLanguage::En),
            (Some("ru"), InterfaceLanguage::Ru),
            (Some("ru-RU"), InterfaceLanguage::Zh),
            (Some(""), InterfaceLanguage::Zh),
        ] {
            let language = InterfaceLanguage::from_setting(value);
            assert_eq!(language, expected);
            assert_eq!(InterfaceLanguage::from_code(language.code()), language);
        }
        assert_eq!(InterfaceLanguage::from_code(u8::MAX), InterfaceLanguage::Zh);
    }

    #[test]
    fn test_threads_stay_chinese_unless_they_override_the_language() {
        remember_language(Some("ru"));
        assert_eq!(interface_language(), InterfaceLanguage::Zh);
        let inner = with_interface_language(InterfaceLanguage::Ru, || {
            let nested = with_interface_language(InterfaceLanguage::En, interface_language);
            (nested, interface_language())
        });
        assert_eq!(inner, (InterfaceLanguage::En, InterfaceLanguage::Ru));
        assert_eq!(interface_language(), InterfaceLanguage::Zh);
        let other_thread = with_interface_language(InterfaceLanguage::Ru, || {
            std::thread::spawn(interface_language).join().unwrap()
        });
        assert_eq!(other_thread, InterfaceLanguage::Zh);
    }
}
