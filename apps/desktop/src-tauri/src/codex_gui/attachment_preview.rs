//! Desktop draft previews have no thread yet; read only the explicitly attached raster image.
use serde::{Deserialize, Serialize};

use super::{
    error::{GuiError, Result},
    image_preview::{encode_image, source_path},
    image_thumbnail::{render, ImageVariant},
};

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct AttachmentPreviewRequest {
    path: String,
    variant: ImageVariant,
}

#[derive(Serialize)]
pub(crate) struct AttachmentPreviewResponse {
    url: String,
}

fn preview(request: AttachmentPreviewRequest) -> Result<AttachmentPreviewResponse> {
    let path = source_path(&request.path)?;
    if !path.is_absolute() {
        return Err(GuiError::ImagePreview);
    }
    super::images::input_limited(request.path, MAX_IMAGE_BYTES)?;
    let url = render(encode_image(&path, MAX_IMAGE_BYTES)?, request.variant)?;
    Ok(AttachmentPreviewResponse { url })
}

/// Local desktop attachment previews are deliberately excluded from the web request bridge.
#[tauri::command]
pub(crate) async fn codex_gui_attachment_preview(
    request: AttachmentPreviewRequest,
) -> std::result::Result<AttachmentPreviewResponse, String> {
    tauri::async_runtime::spawn_blocking(move || preview(request))
        .await
        .map_err(|_| GuiError::ImagePreview.to_string())?
        .map_err(|_| GuiError::ImagePreview.to_string())
}

#[cfg(test)]
#[path = "attachment_preview_tests.rs"]
mod tests;
