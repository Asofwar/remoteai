use std::{fs, path::Path};

use super::model::{Preferences, ShortcutError};

pub(super) fn read(path: &Path) -> Result<Preferences, ShortcutError> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| ShortcutError::Load),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Preferences::default()),
        Err(_) => Err(ShortcutError::Load),
    }
}

pub(super) fn save(path: &Path, preferences: &Preferences) -> Result<(), ShortcutError> {
    let value = serde_json::to_value(preferences).map_err(|_| ShortcutError::Save)?;
    crate::storage::write_json_atomic(path, &value).map_err(|error| {
        eprintln!("failed to save keyboard shortcuts: {error}");
        ShortcutError::Save
    })
}
