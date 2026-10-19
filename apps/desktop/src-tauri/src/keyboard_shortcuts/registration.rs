use tauri_plugin_global_shortcut::Shortcut;

use super::model::{Action, ShortcutError};

pub(super) trait Registry {
    fn register(&self, action: Action, shortcut: Shortcut) -> Result<(), ShortcutError>;
    fn unregister(&self, shortcut: Shortcut) -> Result<(), ShortcutError>;
}

/// Reserve the new binding before releasing the old one, and roll back failed saves.
pub(super) fn replace(
    registry: &impl Registry,
    action: Action,
    binding: (&mut Option<Shortcut>, Option<Shortcut>),
    save: impl FnOnce() -> Result<(), ShortcutError>,
) -> Result<(), ShortcutError> {
    let (active, next) = binding;
    let previous = *active;
    if previous == next {
        return save();
    }
    if let Some(shortcut) = next {
        registry.register(action, shortcut)?;
    }
    if let Some(shortcut) = previous {
        if let Err(error) = registry.unregister(shortcut) {
            remove_new_binding(registry, next);
            return Err(error);
        }
    }
    *active = next;
    if let Err(error) = save() {
        remove_new_binding(registry, next);
        *active = None;
        if let Some(shortcut) = previous {
            match registry.register(action, shortcut) {
                Ok(()) => *active = previous,
                Err(restore_error) => eprintln!("failed to restore shortcut: {restore_error}"),
            }
        }
        return Err(error);
    }
    Ok(())
}

fn remove_new_binding(registry: &impl Registry, next: Option<Shortcut>) {
    if let Some(shortcut) = next {
        if let Err(error) = registry.unregister(shortcut) {
            eprintln!("failed to remove pending shortcut: {error}");
        }
    }
}
