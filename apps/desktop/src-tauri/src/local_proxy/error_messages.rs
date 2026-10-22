//! Translate known connection failures without exposing upstream URLs or credentials.

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(super) enum TransportFailure {
    TlsClosed,
    Certificate,
    Tls,
    Dns,
    Refused,
    Disconnected,
    ConnectTimeout,
    UploadTimeout,
    ResponseTimeout,
    RedirectLimit,
    RedirectScheme,
    InvalidRequest,
    Proxy,
    Connection,
}

impl TransportFailure {
    pub(super) fn message(self) -> &'static str {
        match self {
            Self::TlsClosed => concat!(
                "连接上游服务时，安全连接尚未建立就被断开。",
                "请检查网络或代理是否稳定后重试。",
            ),
            Self::Certificate => "无法验证上游服务的安全证书。请检查系统时间和代理设置后重试。",
            Self::Tls => "无法与上游服务建立安全连接。请检查网络或代理设置后重试。",
            Self::Dns => "无法解析上游服务的地址。请检查网络、代理或服务地址是否正确后重试。",
            Self::Refused => "连接被上游服务或代理拒绝。请确认服务可用，并检查代理地址和端口。",
            Self::Disconnected => "与上游服务的连接意外中断，请检查网络或代理是否稳定后重试。",
            Self::ConnectTimeout => "连接上游服务超时，请检查网络或代理是否可用后重试。",
            Self::UploadTimeout => "上传请求连续 240 秒无进展，请检查网络或代理是否稳定后重试。",
            Self::ResponseTimeout => {
                "等待上游服务响应超时，请稍后重试。若持续出现，请检查服务状态。"
            }
            Self::Connection => "无法连接上游服务，请检查网络、代理和服务地址后重试。",
            Self::RedirectLimit => {
                "上游 HTTP 重定向次数已达到设置上限。请检查服务地址，或调整最大重定向次数。"
            }
            Self::RedirectScheme => "上游重定向到了不支持的地址协议；仅支持 HTTP 和 HTTPS。",
            Self::InvalidRequest => "无法创建上游请求，请检查服务地址格式和自定义请求头。",
            Self::Proxy => "无法读取或应用网络代理设置，请检查系统代理或 PAC 配置。",
        }
    }

    // Order matters: certificate and handshake failures also contain generic connection errors.
    const RULES: &'static [(Self, &'static [&'static str])] = &[
        (Self::RedirectLimit, &["redirect limit exceeded"]),
        (Self::RedirectScheme, &["unsupported redirect scheme"]),
        (
            Self::InvalidRequest,
            &[
                "builder error",
                "relative url",
                "invalid url",
                "invalid header",
            ],
        ),
        (
            Self::Proxy,
            &["pac ", "proxy resolution", "proxy configuration"],
        ),
        (Self::UploadTimeout, &["timed out during request upload"]),
        (
            Self::ResponseTimeout,
            &["timed out during response headers"],
        ),
        (
            Self::TlsClosed,
            &["tls handshake eof", "tls handshake: unexpected eof"],
        ),
        (
            Self::Certificate,
            &["certificate", "certnotvalid", "unknownissuer"],
        ),
        (Self::Tls, &["tls handshake", "tls error", "ssl error"]),
        (
            Self::Dns,
            &[
                "dns error",
                "failed to lookup address",
                "name or service not known",
                "os error 11001",
            ],
        ),
        (
            Self::Refused,
            &["connection refused", "actively refused", "os error 10061"],
        ),
        (
            Self::Disconnected,
            &[
                "connection reset",
                "connection closed",
                "broken pipe",
                "os error 10054",
            ],
        ),
        (Self::ConnectTimeout, &["timed out", "timeout"]),
    ];

    pub(super) fn classify(detail: &str) -> Self {
        Self::RULES
            .iter()
            .find(|(_, markers)| markers.iter().any(|marker| detail.contains(marker)))
            .map_or(Self::Connection, |(failure, _)| *failure)
    }
}

pub(super) fn transport(error: &str) -> Option<&'static str> {
    transport_failure(error).map(TransportFailure::message)
}

fn transport_failure(error: &str) -> Option<TransportFailure> {
    let detail = error
        .strip_prefix("Official Codex proxy request failed: ")
        .or_else(|| error.strip_prefix("Provider proxy request failed: "))
        .or_else(|| error.strip_prefix("Messages request failed: "))
        .or_else(|| error.strip_prefix("Content generation request failed: "))
        .or_else(|| error.strip_prefix("Chat bridge request failed: "))
        .or_else(|| error.strip_prefix("Failed to create proxy HTTP client: "))?;
    Some(TransportFailure::classify(&detail.to_ascii_lowercase()))
}

/// Retry count appended by the transport layer, reported only when it retried.
fn transport_attempts(error: &str) -> Option<u64> {
    error
        .rsplit_once("(attempts: ")
        .and_then(|(_, count)| count.strip_suffix(')'))
        .and_then(|count| count.parse::<u64>().ok())
        .filter(|count| *count > 1)
}

pub(super) fn gui(error: &str) -> String {
    if let Some(known) = super::request_error::RequestError::decode(error) {
        return known.to_string();
    }
    if let Some(message) = super::request_error::catalog_message(error) {
        return message;
    }
    if crate::storage::interface_language() == crate::storage::InterfaceLanguage::Ru {
        return russian::gui(error);
    }
    if let Some(message) = transport(error) {
        return match transport_attempts(error) {
            Some(count) => format!("{message}已尝试 {count} 次。"),
            None => message.to_string(),
        };
    }
    // Known failures get actionable copy; other failures retain their sanitized cause.
    match error {
        "请先选择 Codex GUI 账户。"
        | "暂时无法读取 Codex GUI 账户，请稍后重试。"
        | "此账户已不可用，请重新选择。"
        | "暂时无法读取自动切号设置，请稍后重试。"
        | "暂无符合条件的账号，请调整自动切号设置或选择其他账户。"
        | "账户已切换，请重新刷新模型列表。" => error,
        "账户设置已更新。" => "账户设置已更新，请重试本次请求。",
        _ => {
            return known::message(error)
                .map(str::to_string)
                .unwrap_or_else(|| diagnostic_fallback(error))
        }
    }
    .to_string()
}

fn diagnostic_fallback(error: &str) -> String {
    // Invalid typed envelopes are internal data, not human-readable failure messages.
    let detail =
        if error.starts_with("proxy_request_error:") || error.starts_with("proxy_catalog_error:") {
            "错误信息格式无效，请重试。".to_string()
        } else {
            crate::error_logs::sanitize_diagnostic_message(error)
        };
    let detail = if detail.is_empty() {
        "未收到具体错误信息。"
    } else {
        &detail
    };
    format!("请求失败：{detail}（错误编号 {}）", error_id(error))
}

/// Stable correlation with the detailed diagnostic entry without exposing its private contents.
pub(super) fn error_id(error: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(error.as_bytes())[..4]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Fixed client-visible proxy texts produced outside `gui`, in the saved interface language.
/// The Chinese source stays the canonical value that tests and diagnostics compare.
pub(super) fn localized(source: &'static str) -> &'static str {
    if crate::storage::interface_language() == crate::storage::InterfaceLanguage::Ru {
        return russian::fixed(source).unwrap_or(source);
    }
    source
}

mod known;
mod russian;

#[cfg(test)]
#[path = "error_messages_tests.rs"]
mod tests;
