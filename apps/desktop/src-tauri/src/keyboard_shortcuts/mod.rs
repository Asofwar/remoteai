mod actions;
mod model;
mod preferences;
mod registration;
mod screenshot;
#[cfg(test)]
mod tests;

use std::{collections::BTreeMap, path::PathBuf, sync::Mutex};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::Shortcut;

use actions::DesktopRegistry;
use model::{Action, Preferences, ShortcutError, ShortcutSetting, ShortcutUpdate};
use registration::Registry;

#[derive(Default)]
struct ShortcutState {
    initialized: bool,
    preferences: Preferences,
    active: BTreeMap<Action, Option<Shortcut>>,
    errors: BTreeMap<Action, ShortcutError>,
}

/// Only worker threads acquire this lock; the native event handler never waits on it.
#[derive(Default)]
struct KeyboardShortcuts(Mutex<ShortcutState>);

pub(crate) fn setup<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    app.plugin(tauri_plugin_global_shortcut::Builder::new().build())?;
    app.manage(KeyboardShortcuts::default());
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = snapshot(&app) {
            eprintln!("failed to restore keyboard shortcuts: {error}");
        }
    });
    Ok(())
}

fn preferences_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, ShortcutError> {
    // Separate from general settings to prevent cloud sync or stale snapshots from overwriting local bindings.
    crate::storage::app_settings_path(app)
        .map(|path| path.with_file_name("keyboard-shortcuts.json"))
        .map_err(|_| ShortcutError::Load)
}

fn initialize<R: Runtime>(
    app: &AppHandle<R>,
    state: &mut ShortcutState,
) -> Result<(), ShortcutError> {
    if state.initialized {
        return Ok(());
    }
    state.preferences = preferences::read(&preferences_path(app)?)?;
    for action in Action::ALL.into_iter().filter(|action| action.supported()) {
        let update = ShortcutUpdate {
            action,
            shortcut: state.preferences.bindings.get(&action).cloned().flatten(),
        };
        let result = model::validate_update(&state.preferences, &update).and_then(|shortcut| {
            if let Some(shortcut) = shortcut {
                DesktopRegistry(app).register(action, shortcut)?;
            }
            state.active.insert(action, shortcut);
            Ok(())
        });
        if let Err(error) = result {
            state.errors.insert(action, error);
        }
    }
    state.initialized = true;
    Ok(())
}

fn settings(state: &ShortcutState) -> Vec<ShortcutSetting> {
    Action::ALL
        .into_iter()
        .map(|action| ShortcutSetting {
            action,
            shortcut: state.preferences.bindings.get(&action).cloned().flatten(),
            active: state.active.get(&action).copied().flatten().is_some(),
            supported: action.supported(),
            error: state.errors.get(&action).copied(),
        })
        .collect()
}

fn snapshot<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<ShortcutSetting>, ShortcutError> {
    let managed = app
        .try_state::<KeyboardShortcuts>()
        .ok_or(ShortcutError::Unsupported)?;
    let mut state = managed.0.lock().map_err(|_| ShortcutError::Load)?;
    initialize(app, &mut state)?;
    Ok(settings(&state))
}

fn update<R: Runtime>(
    app: &AppHandle<R>,
    update: ShortcutUpdate,
) -> Result<Vec<ShortcutSetting>, ShortcutError> {
    let managed = app
        .try_state::<KeyboardShortcuts>()
        .ok_or(ShortcutError::Unsupported)?;
    let mut state = managed.0.lock().map_err(|_| ShortcutError::Save)?;
    initialize(app, &mut state)?;
    let next = model::validate_update(&state.preferences, &update)?;
    let mut preferences = state.preferences.clone();
    preferences.bindings.insert(update.action, update.shortcut);
    let path = preferences_path(app)?;
    let active = state.active.entry(update.action).or_default();
    registration::replace(&DesktopRegistry(app), update.action, (active, next), || {
        preferences::save(&path, &preferences)
    })?;
    state.preferences = preferences;
    state.errors.remove(&update.action);
    Ok(settings(&state))
}

#[tauri::command]
pub(crate) async fn get_keyboard_shortcuts<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ShortcutSetting>, ShortcutError> {
    tauri::async_runtime::spawn_blocking(move || snapshot(&app))
        .await
        .map_err(|_| ShortcutError::Load)?
}

#[tauri::command]
pub(crate) async fn set_keyboard_shortcut<R: Runtime>(
    app: AppHandle<R>,
    update: ShortcutUpdate,
) -> Result<Vec<ShortcutSetting>, ShortcutError> {
    tauri::async_runtime::spawn_blocking(move || self::update(&app, update))
        .await
        .map_err(|_| ShortcutError::Save)?
}
