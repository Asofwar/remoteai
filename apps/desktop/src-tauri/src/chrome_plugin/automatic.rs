//! Keep existing unpacked installations in sync when the desktop application starts.
use std::{
    fs,
    path::{Path, PathBuf},
};

use super::{config, extension, install, registration, BrowserError, Result, INSTALL_CHANGES};

/// File and registration updates never block the window's message thread.
pub(crate) fn refresh_on_startup() {
    tauri::async_runtime::spawn_blocking(|| {
        if let Err(error) = refresh() {
            eprintln!("Chrome plugin automatic update failed: {error}");
        }
    });
}

fn refresh() -> Result<()> {
    if !registration::supported() {
        return Ok(());
    }
    let _guard = INSTALL_CHANGES.lock().map_err(|_| BrowserError::Storage)?;
    let root = super::bridge_root()?;
    let executable = std::env::current_exe().map_err(|_| BrowserError::Storage)?;
    refresh_with(&root, &executable, || {
        registration::register(&root, &executable)
    })
}

fn refresh_with(
    root: &Path,
    executable: &Path,
    register: impl FnOnce() -> Result<()>,
) -> Result<()> {
    let homes = installed_homes(root)?;
    if homes.is_empty() {
        return Ok(());
    }
    extension::export(root)?;
    register()?;
    let mut result = Ok(());
    for home in homes {
        if let Err(error) = install::refresh_home(root, &home, executable) {
            eprintln!("Chrome plugin configuration could not be updated: {error}");
            result = Err(error);
        }
    }
    result
}

fn installed_homes(root: &Path) -> Result<Vec<PathBuf>> {
    let clients = match fs::read_dir(root.join("clients")) {
        Ok(clients) => clients,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err(BrowserError::Storage),
    };
    let mut homes = Vec::new();
    for entry in clients {
        let entry = entry.map_err(|_| BrowserError::Storage)?;
        if entry.path().extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let id = entry
            .path()
            .file_stem()
            .and_then(|id| id.to_str())
            .unwrap_or_default()
            .to_owned();
        match config::load(root, &id) {
            Ok(record) if record.home.is_dir() && config::client_id(&record.home) == id => {
                homes.push(record.home)
            }
            Ok(_) => {}
            Err(error) => eprintln!("Chrome plugin record could not be updated: {error}"),
        }
    }
    Ok(homes)
}

#[cfg(test)]
#[path = "automatic_tests.rs"]
mod tests;
