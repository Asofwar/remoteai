use std::{collections::HashMap, fs::File, io::Write, path::PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use tempfile::TempDir;

const MAX_CHUNK_BYTES: usize = 256 * 1024;
const MAX_ENCODED_BYTES: usize = MAX_CHUNK_BYTES.div_ceil(3) * 4;
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024 * 1024;
const MAX_PENDING_FILES: usize = 2;

#[derive(Debug, thiserror::Error)]
pub(super) enum OpenError {
    #[error("文件信息无效，请重新下载后打开。")]
    Invalid,
    #[error("打开未完成，请检查设备空间后重试。")]
    Storage,
    #[error("无法打开文件，请确认已安装可打开此文件的应用。")]
    Open,
}

#[derive(Default)]
pub(super) struct DownloadFiles {
    pending: HashMap<String, PreparedDownload>,
    // Keep files available to external applications for the lifetime of this process.
    opened: Vec<TempDir>,
}

pub(super) struct PreparedDownload {
    file: File,
    directory: TempDir,
    name: String,
    size: u64,
    written: u64,
}

fn valid_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        stem.strip_prefix(prefix).is_some_and(|suffix| {
            matches!(
                suffix,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    });
    !name.is_empty()
        && name.len() <= 255
        && !name.ends_with(['.', ' '])
        && !name
            .chars()
            .any(|c| c.is_control() || "/\\:<>\"|?*".contains(c))
        && !reserved
}

impl DownloadFiles {
    pub(super) fn begin(&mut self, name: &str, size: u64) -> Result<String, OpenError> {
        if !valid_name(name) || size > MAX_FILE_BYTES || self.pending.len() >= MAX_PENDING_FILES {
            return Err(OpenError::Invalid);
        }
        let directory = tempfile::Builder::new()
            .prefix("remoteai-download-")
            .tempdir()
            .map_err(|_| OpenError::Storage)?;
        let file = File::options()
            .write(true)
            .create_new(true)
            .open(directory.path().join("download.part"))
            .map_err(|_| OpenError::Storage)?;
        let id = uuid::Uuid::new_v4().to_string();
        self.pending.insert(
            id.clone(),
            PreparedDownload {
                file,
                directory,
                name: name.to_owned(),
                size,
                written: 0,
            },
        );
        Ok(id)
    }

    pub(super) fn write(&mut self, id: &str, encoded: &str) -> Result<(), OpenError> {
        if encoded.len() > MAX_ENCODED_BYTES {
            return Err(OpenError::Invalid);
        }
        let bytes = STANDARD.decode(encoded).map_err(|_| OpenError::Invalid)?;
        let download = self.pending.get_mut(id).ok_or(OpenError::Invalid)?;
        if bytes.is_empty()
            || bytes.len() > MAX_CHUNK_BYTES
            || download.written + bytes.len() as u64 > download.size
        {
            return Err(OpenError::Invalid);
        }
        download
            .file
            .write_all(&bytes)
            .map_err(|_| OpenError::Storage)?;
        download.written += bytes.len() as u64;
        Ok(())
    }

    pub(super) fn take(&mut self, id: &str) -> Result<PreparedDownload, OpenError> {
        self.pending.remove(id).ok_or(OpenError::Invalid)
    }

    pub(super) fn cancel(&mut self, id: &str) {
        self.pending.remove(id);
    }
    pub(super) fn retain(&mut self, directory: TempDir) {
        self.opened.push(directory);
    }
}

impl PreparedDownload {
    pub(super) fn finish(self) -> Result<(TempDir, PathBuf), OpenError> {
        if self.written != self.size {
            return Err(OpenError::Invalid);
        }
        self.file.sync_all().map_err(|_| OpenError::Storage)?;
        drop(self.file);
        let path = self.directory.path().join(self.name);
        std::fs::rename(self.directory.path().join("download.part"), &path)
            .map_err(|_| OpenError::Storage)?;
        Ok((self.directory, path))
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
