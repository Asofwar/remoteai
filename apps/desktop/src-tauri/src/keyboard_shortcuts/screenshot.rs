use tauri::{AppHandle, Runtime};

#[cfg(windows)]
pub(super) fn capture<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    // The legacy URI also works on Windows 10, where the newer /capture path is unavailable.
    app.opener()
        .open_url("ms-screenclip:", None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
pub(super) fn capture<R: Runtime>(_app: &AppHandle<R>) -> Result<(), String> {
    let status = std::process::Command::new("/usr/sbin/screencapture")
        .args(["-i", "-c"])
        .status()
        .map_err(|error| error.to_string())?;
    // Escape cancels interactive capture and exits with status 1.
    if status.success() || status.code() == Some(1) {
        Ok(())
    } else {
        Err("System screenshot tool failed".to_string())
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
pub(super) fn capture<R: Runtime>(_app: &AppHandle<R>) -> Result<(), String> {
    Err("System screenshot is unavailable".to_string())
}
