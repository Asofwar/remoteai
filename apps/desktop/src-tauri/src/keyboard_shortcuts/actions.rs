use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use super::{
    model::{Action, ShortcutError},
    registration::Registry,
};

pub(super) struct DesktopRegistry<'a, R: Runtime>(pub(super) &'a AppHandle<R>);

impl<R: Runtime> Registry for DesktopRegistry<'_, R> {
    fn register(&self, action: Action, shortcut: Shortcut) -> Result<(), ShortcutError> {
        // Some platforms emit repeated presses while a key is held. Launch once per press.
        let pressed = AtomicBool::new(false);
        self.0
            .global_shortcut()
            .on_shortcut(shortcut, move |app, _, event| {
                if event.state == ShortcutState::Released {
                    pressed.store(false, Ordering::Release);
                } else if !pressed.swap(true, Ordering::AcqRel) {
                    dispatch(app.clone(), action);
                }
            })
            .map_err(|error| {
                eprintln!("failed to register {action:?} shortcut: {error}");
                ShortcutError::Unavailable
            })
    }

    fn unregister(&self, shortcut: Shortcut) -> Result<(), ShortcutError> {
        self.0
            .global_shortcut()
            .unregister(shortcut)
            .map_err(|error| {
                eprintln!("failed to unregister shortcut: {error}");
                ShortcutError::Unavailable
            })
    }
}

fn dispatch<R: Runtime>(app: AppHandle<R>, action: Action) {
    tauri::async_runtime::spawn(async move {
        let result = match action {
            Action::OpenTokenUsage => crate::local_proxy::show_token_usage_window(app).await,
            Action::ToggleFloatingBubble => crate::floating_bubble::toggle_floating_bubble(app)
                .await
                .map(|_| ()),
            _ => tauri::async_runtime::spawn_blocking(move || match action {
                Action::Screenshot => super::screenshot::capture(),
                Action::ShowMainWindow => {
                    crate::system_tray::show_dashboard(&app);
                    Ok(())
                }
                Action::OpenSettings => {
                    crate::system_tray::show_settings(&app);
                    Ok(())
                }
                _ => Ok(()),
            })
            .await
            .map_err(|error| error.to_string())
            .and_then(|result| result),
        };
        if let Err(error) = result {
            eprintln!("keyboard shortcut action {action:?} failed: {error}");
        }
    });
}
