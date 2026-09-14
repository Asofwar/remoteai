use std::{
    fs::{File, Metadata},
    io::{Read, Seek, SeekFrom},
    path::Path,
    time::SystemTime,
};

use super::super::error::{GuiError, Result};
use super::{VideoChunk, VideoInfo, VideoRead, CHUNK_BYTES};

pub(super) struct VideoFile {
    file: File,
    info: VideoInfo,
    modified: SystemTime,
}

fn local_path(root: &Path, source: &str) -> Result<std::path::PathBuf> {
    let normalized = source.replace('\\', "/");
    let without_drive = if normalized.as_bytes().get(1) == Some(&b':')
        && normalized.as_bytes()[0].is_ascii_alphabetic()
        && normalized.as_bytes().get(2) == Some(&b'/')
    {
        &normalized[2..]
    } else {
        &normalized
    };
    if source.is_empty()
        || source.len() > 4096
        || source.chars().any(char::is_control)
        || normalized.starts_with("//")
        || without_drive.contains(':')
        || !root.is_absolute()
    {
        return Err(GuiError::VideoPreview);
    }
    let root = root.canonicalize().map_err(|_| GuiError::VideoPreview)?;
    let path = root
        .join(source)
        .canonicalize()
        .map_err(|_| GuiError::VideoPreview)?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(GuiError::VideoPreview);
    }
    Ok(path)
}

fn check_size(metadata: &Metadata, max_bytes: u64) -> Result<()> {
    if !metadata.is_file() || metadata.len() == 0 {
        return Err(GuiError::VideoPreview);
    }
    if metadata.len() > max_bytes.max(1) {
        return Err(GuiError::VideoTooLarge);
    }
    Ok(())
}

fn mime_type(path: &Path, file: &mut File) -> Result<&'static str> {
    let mut header = [0; 12];
    file.read_exact(&mut header)
        .map_err(|_| GuiError::VideoPreview)?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "mp4" | "m4v" if &header[4..8] == b"ftyp" => Ok("video/mp4"),
        "mov"
            if [&b"ftyp"[..], &b"moov"[..], &b"mdat"[..], &b"wide"[..]]
                .contains(&&header[4..8]) =>
        {
            Ok("video/quicktime")
        }
        "webm" if header[..4] == [0x1a, 0x45, 0xdf, 0xa3] => Ok("video/webm"),
        _ => Err(GuiError::VideoPreview),
    }
}

impl VideoFile {
    pub(super) fn open(root: &Path, source: &str, max_bytes: u64) -> Result<Self> {
        let path = local_path(root, source)?;
        let mut file = File::open(&path).map_err(|_| GuiError::VideoPreview)?;
        let metadata = file.metadata().map_err(|_| GuiError::VideoPreview)?;
        check_size(&metadata, max_bytes)?;
        let mime_type = mime_type(&path, &mut file)?.to_owned();
        let modified = metadata.modified().map_err(|_| GuiError::VideoPreview)?;
        let info = VideoInfo {
            id: uuid::Uuid::new_v4().to_string(),
            size: metadata.len(),
            mime_type,
        };
        Ok(Self {
            file,
            info,
            modified,
        })
    }

    pub(super) fn info(&self) -> VideoInfo {
        self.info.clone()
    }

    pub(super) fn read(&mut self, request: &VideoRead) -> Result<VideoChunk> {
        if request.length == 0 || request.length > CHUNK_BYTES || request.offset >= self.info.size {
            return Err(GuiError::InvalidRequest);
        }
        let metadata = self.file.metadata().map_err(|_| GuiError::VideoPreview)?;
        check_size(&metadata, request.max_bytes)?;
        if metadata.len() != self.info.size || metadata.modified().ok() != Some(self.modified) {
            return Err(GuiError::VideoChanged);
        }
        let length = request.length.min(self.info.size - request.offset);
        let mut bytes = vec![0; length as usize];
        self.file
            .seek(SeekFrom::Start(request.offset))
            .map_err(|_| GuiError::VideoPreview)?;
        self.file
            .read_exact(&mut bytes)
            .map_err(|_| GuiError::VideoPreview)?;
        use base64::{engine::general_purpose::STANDARD, Engine};
        Ok(VideoChunk {
            offset: request.offset,
            data: STANDARD.encode(bytes),
        })
    }
}
