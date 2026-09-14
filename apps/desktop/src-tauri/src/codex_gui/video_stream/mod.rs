//! Task-scoped file handles with bounded reads, expiry and no whole-video buffering.
mod file;
#[cfg(test)]
mod tests;

use super::{
    client::Client,
    error::{GuiError, Result},
    protocol::{thread_params, GuiResponse},
};
use file::VideoFile;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

const CHUNK_BYTES: u64 = 256 * 1024;
const MAX_SESSIONS: usize = 16;
const IDLE_TIMEOUT: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VideoOpen {
    pub thread_id: String,
    pub path: String,
    pub max_bytes: u64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VideoRead {
    pub thread_id: String,
    pub id: String,
    pub offset: u64,
    pub length: u64,
    pub max_bytes: u64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VideoClose {
    pub thread_id: String,
    pub id: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct VideoInfo {
    id: String,
    size: u64,
    mime_type: String,
}
#[derive(Serialize)]
pub(super) struct VideoChunk {
    offset: u64,
    data: String,
}

struct Session {
    thread_id: String,
    touched: Instant,
    file: Arc<Mutex<VideoFile>>,
}
#[derive(Default)]
pub(crate) struct VideoStreams {
    sessions: Mutex<HashMap<String, Session>>,
}

fn response(value: impl Serialize) -> Result<GuiResponse> {
    Ok(GuiResponse {
        data: serde_json::to_value(value).map_err(|_| GuiError::VideoPreview)?,
    })
}

impl VideoStreams {
    pub(super) async fn open(
        self: Arc<Self>,
        client: &Client,
        options: VideoOpen,
    ) -> Result<GuiResponse> {
        let thread = client
            .request("thread/read", thread_params(options.thread_id.clone())?)
            .await?;
        let root = PathBuf::from(
            thread["thread"]["cwd"]
                .as_str()
                .ok_or(GuiError::VideoPreview)?,
        );
        tauri::async_runtime::spawn_blocking(move || response(self.insert(root, options)?))
            .await
            .map_err(|_| GuiError::VideoPreview)?
    }

    fn insert(&self, root: PathBuf, options: VideoOpen) -> Result<VideoInfo> {
        let file = VideoFile::open(&root, &options.path, options.max_bytes)?;
        let info = file.info();
        let mut sessions = self.sessions.lock().map_err(|_| GuiError::VideoPreview)?;
        sessions.retain(|_, session| session.touched.elapsed() < IDLE_TIMEOUT);
        if sessions.len() >= MAX_SESSIONS {
            return Err(GuiError::VideoBusy);
        }
        sessions.insert(
            info.id.clone(),
            Session {
                thread_id: options.thread_id,
                touched: Instant::now(),
                file: Arc::new(Mutex::new(file)),
            },
        );
        Ok(info)
    }

    fn read_chunk(&self, options: VideoRead) -> Result<VideoChunk> {
        let file = {
            let mut sessions = self.sessions.lock().map_err(|_| GuiError::VideoPreview)?;
            sessions.retain(|_, session| session.touched.elapsed() < IDLE_TIMEOUT);
            let session = sessions
                .get_mut(&options.id)
                .ok_or(GuiError::VideoExpired)?;
            if session.thread_id != options.thread_id {
                return Err(GuiError::VideoExpired);
            }
            session.touched = Instant::now();
            Arc::clone(&session.file)
        };
        let mut file = file.lock().map_err(|_| GuiError::VideoPreview)?;
        file.read(&options)
    }

    pub(super) async fn read(self: Arc<Self>, options: VideoRead) -> Result<GuiResponse> {
        tauri::async_runtime::spawn_blocking(move || response(self.read_chunk(options)?))
            .await
            .map_err(|_| GuiError::VideoPreview)?
    }

    fn remove(&self, options: VideoClose) -> Result<()> {
        let mut sessions = self.sessions.lock().map_err(|_| GuiError::VideoPreview)?;
        if sessions
            .get(&options.id)
            .is_some_and(|session| session.thread_id != options.thread_id)
        {
            return Err(GuiError::VideoExpired);
        }
        sessions.remove(&options.id);
        Ok(())
    }

    pub(super) async fn close(self: Arc<Self>, options: VideoClose) -> Result<GuiResponse> {
        tauri::async_runtime::spawn_blocking(move || {
            self.remove(options)?;
            response(())
        })
        .await
        .map_err(|_| GuiError::VideoPreview)?
    }
}
