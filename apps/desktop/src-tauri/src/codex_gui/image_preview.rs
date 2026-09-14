//! Preview workspace images and exact image references recorded by the task's app server.
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use image::ImageFormat;
use serde_json::{json, Value};

use super::{
    client::Client,
    error::{GuiError, Result},
    protocol::{thread_params, GuiResponse},
};

const DEFAULT_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_SOURCE_LENGTH: usize = 4096;

pub(super) struct PreviewOptions {
    pub variant: super::image_thumbnail::ImageVariant,
    pub max_bytes: Option<u64>,
}

fn render_limited(source: String, options: PreviewOptions) -> Result<String> {
    let limit = options.max_bytes.unwrap_or(DEFAULT_IMAGE_BYTES).max(1);
    let encoded = source.split_once(',').ok_or(GuiError::ImagePreview)?.1;
    let padding = encoded
        .chars()
        .rev()
        .take_while(|character| *character == '=')
        .count();
    if (encoded.len() * 3 / 4).saturating_sub(padding) as u64 > limit {
        return Err(GuiError::ImagePreview);
    }
    super::image_thumbnail::render(source, options.variant)
}

pub(super) async fn preview(
    client: &Client,
    thread_id: String,
    source: String,
    options: PreviewOptions,
) -> Result<GuiResponse> {
    uuid::Uuid::parse_str(&thread_id).map_err(|_| GuiError::InvalidRequest)?;
    let limit = options.max_bytes.unwrap_or(DEFAULT_IMAGE_BYTES).max(1);
    let source = if source.starts_with("https://") || source.starts_with("http://") {
        super::image_download::download(&source, limit).await?
    } else {
        source
    };
    if source.starts_with("data:image/") {
        // Inline bytes grant no filesystem access; use the same input validation as attachments.
        let data = tauri::async_runtime::spawn_blocking(move || {
            super::images::input_limited(source.clone(), limit)?;
            render_limited(source, options)
        })
        .await
        .map_err(|_| GuiError::ImagePreview)??;
        return Ok(GuiResponse {
            data: json!({ "url": data }),
        });
    }
    let mut params = thread_params(thread_id.clone())?;
    params["includeTurns"] = json!(true);
    // Read the actual workspace before the presentation layer hides projectless paths.
    let response = client.request("thread/read", params).await?;
    let workspace = response["thread"]["cwd"]
        .as_str()
        .ok_or(GuiError::ImagePreview)?;
    let workspace = PathBuf::from(workspace);
    let generated = client.home.join("generated_images").join(thread_id);
    let data = tauri::async_runtime::spawn_blocking(move || {
        let references = image_references(&response["thread"]);
        let original = read_image(
            &source,
            &workspace,
            ReadOptions {
                generated: &generated,
                references: &references,
                max_bytes: limit,
            },
        )?;
        render_limited(original, options)
    })
    .await
    .map_err(|_| GuiError::ImagePreview)??;
    Ok(GuiResponse {
        data: json!({ "url": data }),
    })
}

pub(super) fn source_path(source: &str) -> Result<PathBuf> {
    if source.is_empty() || source.len() > MAX_SOURCE_LENGTH || source.contains('\0') {
        return Err(GuiError::ImagePreview);
    }
    let path = if source
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("file:"))
    {
        let url = url::Url::parse(source).map_err(|_| GuiError::ImagePreview)?;
        if url.host_str().is_some_and(|host| host != "localhost")
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(GuiError::ImagePreview);
        }
        url.to_file_path().map_err(|_| GuiError::ImagePreview)?
    } else {
        PathBuf::from(source)
    };
    // Do not turn model-provided image references into network shares or device access.
    let text = path.to_string_lossy();
    if text.replace('\\', "/").starts_with("//") || text.contains("://") {
        return Err(GuiError::ImagePreview);
    }
    Ok(path)
}

fn within(path: &Path, root: &Path) -> bool {
    root.canonicalize().is_ok_and(|root| path.starts_with(root))
}

fn image_references(thread: &Value) -> Vec<&str> {
    thread["turns"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|turn| turn["items"].as_array().into_iter().flatten())
        .flat_map(item_image_references)
        .collect()
}

fn item_image_references(item: &Value) -> Vec<&str> {
    match item["type"].as_str() {
        Some("imageView") => item["path"].as_str().into_iter().collect(),
        Some("imageGeneration") => ["savedPath", "path", "result"]
            .into_iter()
            .filter_map(|key| item[key].as_str())
            .collect(),
        Some("userMessage") => item["content"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|content| content["type"] == "localImage")
            .filter_map(|content| content["path"].as_str())
            .collect(),
        _ => Vec::new(),
    }
}

fn matches_reference(path: &Path, workspace: &Path, references: &[&str]) -> bool {
    // Grant only the recorded file, never its parent directory or arbitrary message text.
    references.iter().any(|source| {
        source_path(source)
            .and_then(|source| {
                workspace
                    .join(source)
                    .canonicalize()
                    .map_err(|_| GuiError::ImagePreview)
            })
            .is_ok_and(|reference| reference == path)
    })
}

struct ReadOptions<'a> {
    generated: &'a Path,
    references: &'a [&'a str],
    max_bytes: u64,
}

fn read_image(source: &str, workspace: &Path, options: ReadOptions<'_>) -> Result<String> {
    let source = source_path(source)?;
    let path = workspace
        .join(source)
        .canonicalize()
        .map_err(|_| GuiError::ImagePreview)?;
    if !within(&path, workspace)
        && !within(&path, options.generated)
        && !matches_reference(&path, workspace, options.references)
    {
        return Err(GuiError::ImagePreview);
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp", "gif"].contains(&extension.as_str()) {
        return Err(GuiError::ImagePreview);
    }
    encode_image(&path, options.max_bytes)
}

pub(super) fn encode_image(path: &Path, max_bytes: u64) -> Result<String> {
    let file = File::open(path).map_err(|_| GuiError::ImagePreview)?;
    let metadata = file.metadata().map_err(|_| GuiError::ImagePreview)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > max_bytes {
        return Err(GuiError::ImagePreview);
    }
    let mut bytes = Vec::new();
    file.take(max_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|_| GuiError::ImagePreview)?;
    if bytes.len() as u64 > max_bytes {
        return Err(GuiError::ImagePreview);
    }
    let mime = match image::guess_format(&bytes).map_err(|_| GuiError::ImagePreview)? {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        ImageFormat::Gif => "image/gif",
        _ => return Err(GuiError::ImagePreview),
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
#[path = "image_preview_tests.rs"]
mod tests;
