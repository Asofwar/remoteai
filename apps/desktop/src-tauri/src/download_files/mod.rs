//! Open verified downloads through the local default application, using bounded temporary writes.
use std::sync::Mutex;

use serde::Deserialize;
use tauri::Manager;

mod storage;
use storage::{DownloadFiles, OpenError};

#[derive(Default)]
pub(crate) struct DownloadFileState(Mutex<DownloadFiles>);

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum DownloadFileAction {
    Begin { name: String, size: u64 },
    Write { id: String, data: String },
    Open { id: String },
    Cancel { id: String },
}

#[tauri::command]
pub(crate) async fn download_file_action(
    app: tauri::AppHandle,
    request: DownloadFileAction,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || perform(&app, request))
        .await
        .map_err(|_| OpenError::Storage.to_string())?
        .map_err(|error| error.to_string())
}

fn perform(
    app: &tauri::AppHandle,
    request: DownloadFileAction,
) -> Result<Option<String>, OpenError> {
    let state = app.state::<DownloadFileState>();
    let mut files = state.0.lock().map_err(|_| OpenError::Storage)?;
    match request {
        DownloadFileAction::Begin { name, size } => return files.begin(&name, size).map(Some),
        DownloadFileAction::Write { id, data } => files.write(&id, &data)?,
        DownloadFileAction::Cancel { id } => files.cancel(&id),
        DownloadFileAction::Open { id } => {
            let download = files.take(&id)?;
            drop(files);
            // Release the shared lock before flushing or asking another application to start.
            let (directory, path) = download.finish()?;
            tauri_plugin_opener::open_path(path, None::<&str>).map_err(|_| OpenError::Open)?;
            state
                .0
                .lock()
                .map_err(|_| OpenError::Storage)?
                .retain(directory);
        }
    }
    Ok(None)
}
