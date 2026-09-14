use tauri::{Runtime, WebviewWindow};
use windows_sys::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};

/// Rounds the native acrylic surface as well as the WebView's CSS panel on Windows 11.
pub(super) fn round_corners<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let hwnd = window.hwnd()?;
    let preference = DWMWCP_ROUND;
    // SAFETY: Tauri owns this live HWND and the preference points to a correctly sized value.
    // Windows 10 does not support this attribute; retaining square native corners there is intentional.
    let result = unsafe {
        DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            (&preference as *const i32).cast(),
            std::mem::size_of_val(&preference) as u32,
        )
    };
    if result < 0 {
        eprintln!("native rounded menu corners unavailable: {result:#x}");
    }
    Ok(())
}
