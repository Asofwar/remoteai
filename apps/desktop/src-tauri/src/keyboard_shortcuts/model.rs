use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

pub(super) const DEFAULT_SCREENSHOT_SHORTCUT: &str = "Alt+Shift+KeyS";
const MAX_SHORTCUT_LENGTH: usize = 80;

/// The closed set of desktop actions that may be bound through IPC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Action {
    Screenshot,
    ShowMainWindow,
    OpenSettings,
    OpenTokenUsage,
    ToggleFloatingBubble,
}

impl Action {
    pub(super) const ALL: [Self; 5] = [
        Self::Screenshot,
        Self::ShowMainWindow,
        Self::OpenSettings,
        Self::OpenTokenUsage,
        Self::ToggleFloatingBubble,
    ];

    pub(super) fn supported(self) -> bool {
        self != Self::Screenshot || cfg!(any(windows, target_os = "macos", target_os = "linux"))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ShortcutError {
    #[error("invalid shortcut")]
    Invalid,
    #[error("shortcut already assigned")]
    Duplicate,
    #[error("shortcut unavailable")]
    Unavailable,
    #[error("could not read shortcuts")]
    Load,
    #[error("could not save shortcuts")]
    Save,
    #[error("shortcuts are not supported")]
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct Preferences {
    pub(super) bindings: BTreeMap<Action, Option<String>>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            bindings: Action::ALL
                .into_iter()
                .map(|action| {
                    let shortcut = (action == Action::Screenshot)
                        .then(|| DEFAULT_SCREENSHOT_SHORTCUT.to_string());
                    (action, shortcut)
                })
                .collect(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ShortcutUpdate {
    pub(crate) action: Action,
    pub(crate) shortcut: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ShortcutSetting {
    pub(crate) action: Action,
    pub(crate) shortcut: Option<String>,
    pub(crate) active: bool,
    pub(crate) supported: bool,
    pub(crate) error: Option<ShortcutError>,
}

/// Require a modifier so global shortcuts never intercept ordinary typing.
pub(super) fn parse_shortcut(value: &str) -> Result<Shortcut, ShortcutError> {
    if value.len() > MAX_SHORTCUT_LENGTH {
        return Err(ShortcutError::Invalid);
    }
    let shortcut: Shortcut = value.parse().map_err(|_| ShortcutError::Invalid)?;
    let modifiers = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER;
    if !shortcut.mods.intersects(modifiers) {
        return Err(ShortcutError::Invalid);
    }
    Ok(shortcut)
}

pub(super) fn validate_update(
    preferences: &Preferences,
    update: &ShortcutUpdate,
) -> Result<Option<Shortcut>, ShortcutError> {
    if !update.action.supported() {
        return Err(ShortcutError::Unsupported);
    }
    let Some(value) = &update.shortcut else {
        return Ok(None);
    };
    let shortcut = parse_shortcut(value)?;
    let duplicate = preferences.bindings.iter().any(|(action, binding)| {
        *action != update.action
            && action.supported()
            && binding
                .as_deref()
                .and_then(|value| parse_shortcut(value).ok())
                == Some(shortcut)
    });
    if duplicate {
        return Err(ShortcutError::Duplicate);
    }
    Ok(Some(shortcut))
}
