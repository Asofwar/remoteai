use std::borrow::Cow;

pub(super) fn capture() -> Result<(), String> {
    let monitors = xcap::Monitor::all().map_err(|_| "Screen capture is unavailable")?;
    let monitor = monitors
        .into_iter()
        .find(|monitor| monitor.is_primary().unwrap_or(false))
        .ok_or("No display is available")?;
    let image = monitor
        .capture_image()
        .map_err(|_| "Screen capture is unavailable")?;
    let mut clipboard = arboard::Clipboard::new().map_err(|_| "Clipboard is unavailable")?;
    clipboard
        .set_image(arboard::ImageData {
            width: image.width() as usize,
            height: image.height() as usize,
            bytes: Cow::Owned(image.into_raw()),
        })
        .map_err(|_| "Could not copy the screenshot to the clipboard".to_string())
}
