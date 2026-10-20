//! Project-scoped, bounded file editing shared by local and authenticated remote clients.
use super::{
    error::{GuiError, Result},
    platform::execution_path,
    protocol::GuiResponse,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

const MAX_BYTES: usize = 2 * 1024 * 1024;
// Keep revision checks and replacement together. This lock is only acquired on blocking workers.
static EDIT_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Deserialize)]
pub(crate) struct Target {
    cwd: String,
    path: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Save {
    #[serde(flatten)]
    target: Target,
    text: String,
    revision: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Document {
    path: String,
    kind: &'static str,
    size: u64,
    text: Option<String>,
    image: Option<String>,
    revision: String,
    read_only: bool,
}

pub(super) async fn read(target: Target) -> Result<GuiResponse> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = EDIT_LOCK.lock().map_err(|_| GuiError::FileBusy)?;
        response(snapshot(&resolve(&target)?)?)
    })
    .await
    .map_err(|_| GuiError::FileRead)?
}

pub(super) async fn write(request: Save) -> Result<GuiResponse> {
    tauri::async_runtime::spawn_blocking(move || save(request).and_then(response))
        .await
        .map_err(|_| GuiError::ProjectFileWrite)?
}

fn response(document: Document) -> Result<GuiResponse> {
    Ok(GuiResponse {
        data: serde_json::to_value(document).map_err(|_| GuiError::InvalidRequest)?,
    })
}

fn resolve(target: &Target) -> Result<PathBuf> {
    super::local_file::validate(&target.cwd)?;
    super::local_file::validate(&target.path)?;
    let root = Path::new(&target.cwd);
    if !root.is_absolute() || target.cwd.len() > 4096 || target.path.len() > 4096 {
        return Err(GuiError::ProjectFiles);
    }
    let root = root.canonicalize().map_err(|_| GuiError::ProjectFiles)?;
    let path = root
        .join(&target.path)
        .canonicalize()
        .map_err(|_| GuiError::FileRead)?;
    if !path.starts_with(&root) || !root.is_dir() || !path.is_file() {
        return Err(GuiError::ProjectFiles);
    }
    Ok(path)
}

fn bounded_bytes(path: &Path) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| GuiError::FileRead)?
        .take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| GuiError::FileRead)?;
    if bytes.len() > MAX_BYTES {
        return Err(GuiError::ProjectFileTooLarge);
    }
    Ok(bytes)
}

fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn snapshot(path: &Path) -> Result<Document> {
    let metadata = fs::metadata(path).map_err(|_| GuiError::FileRead)?;
    let mut document = Document {
        path: execution_path(path),
        kind: "large",
        size: metadata.len(),
        text: None,
        image: None,
        revision: String::new(),
        read_only: true,
    };
    if metadata.len() > MAX_BYTES as u64 {
        return Ok(document);
    }
    let bytes = bounded_bytes(path)?;
    document.size = bytes.len() as u64;
    document.revision = revision(&bytes);
    if let Some(mime) = image_mime(path) {
        document.kind = "image";
        document.image = Some(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)));
    } else if let Ok(text) = std::str::from_utf8(&bytes) {
        if !text.contains('\0') {
            document.kind = "text";
            document.text = Some(text.to_owned());
            document.read_only = metadata.permissions().readonly();
        } else {
            document.kind = "binary";
        }
    } else {
        document.kind = "binary";
    }
    Ok(document)
}

fn image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

fn save(request: Save) -> Result<Document> {
    if request.text.len() > MAX_BYTES {
        return Err(GuiError::ProjectFileTooLarge);
    }
    let _guard = EDIT_LOCK.lock().map_err(|_| GuiError::FileBusy)?;
    let path = resolve(&request.target)?;
    let current = snapshot(&path)?;
    if current.read_only || current.kind != "text" || request.text.contains('\0') {
        return Err(GuiError::ProjectFileWrite);
    }
    if current.revision != request.revision {
        return Err(GuiError::ProjectFileConflict);
    }
    let parent = path.parent().ok_or(GuiError::ProjectFileWrite)?;
    let mut staged =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| GuiError::ProjectFileWrite)?;
    let permissions = fs::metadata(&path)
        .map_err(|_| GuiError::FileRead)?
        .permissions();
    staged
        .write_all(request.text.as_bytes())
        .and_then(|()| staged.as_file().set_permissions(permissions))
        .and_then(|()| staged.as_file().sync_all())
        .map_err(|_| GuiError::ProjectFileWrite)?;
    // Resolve and check again after staging to retain edits made by other applications while staging.
    if resolve(&request.target)? != path || revision(&bounded_bytes(&path)?) != request.revision {
        return Err(GuiError::ProjectFileConflict);
    }
    staged
        .persist(&path)
        .map_err(|_| GuiError::ProjectFileWrite)?;
    snapshot(&path)
}

#[cfg(test)]
#[path = "project_editor_tests.rs"]
mod tests;
