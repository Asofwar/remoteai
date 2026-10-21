use super::{Cause, RequestError, Stage};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(in crate::local_proxy) enum Failure {
    Authentication,
    Permission,
    RateLimit,
    Quota,
    Model,
    Context,
    TooLarge,
    InvalidRequest,
    Overloaded,
    Timeout,
    Internal,
    ContentFilter,
    ToolArguments,
    Cancelled,
    Unknown,
}

impl Failure {
    pub(super) fn message(self) -> &'static str {
        match self {
            Self::Authentication => "上游拒绝认证，请检查 API 密钥或重新登录账户。",
            Self::Permission => "当前账户无权访问此接口或模型。",
            Self::RateLimit => "上游请求频率或并发数已达上限，请稍后重试。",
            Self::Quota => "上游额度不足或已用尽，请检查余额和配额。",
            Self::Model => "上游找不到请求的模型或接口，请检查模型名称和服务地址。",
            Self::Context => "请求超过模型上下文长度，请缩短对话或减少附件。",
            Self::TooLarge => "上游拒绝了过大的请求，请减少请求内容。",
            Self::InvalidRequest => "上游拒绝了请求参数，请检查模型支持的参数和内容格式。",
            Self::Overloaded => "上游服务过载或暂不可用，请稍后重试。",
            Self::Timeout => "上游处理请求超时，请稍后重试。",
            Self::Internal => "上游服务内部处理失败，请稍后重试。",
            Self::ContentFilter => "上游因内容审核停止生成。",
            Self::ToolArguments => "上游生成的工具调用参数格式无效。",
            Self::Cancelled => "上游已取消本次响应。",
            Self::Unknown => "上游发送了错误事件，但未提供可识别的错误代码。",
        }
    }
}

fn classify(code: &str) -> Option<Failure> {
    Some(match code.to_ascii_lowercase().as_str() {
        "authentication_error" | "invalid_api_key" | "unauthenticated" => Failure::Authentication,
        "permission_error" | "permission_denied" | "access_denied" => Failure::Permission,
        "rate_limit_error" | "rate_limit_exceeded" | "resource_exhausted" => Failure::RateLimit,
        "insufficient_quota" | "quota_exceeded" | "billing_hard_limit_reached" => Failure::Quota,
        "not_found_error" | "not_found" | "model_not_found" => Failure::Model,
        "context_length_exceeded" | "context_window_exceeded" => Failure::Context,
        "request_too_large" | "request_too_large_error" => Failure::TooLarge,
        "invalid_request_error" | "invalid_argument" | "bad_request" => Failure::InvalidRequest,
        "overloaded_error" | "unavailable" | "service_unavailable" => Failure::Overloaded,
        "timeout_error" | "request_timeout" | "deadline_exceeded" => Failure::Timeout,
        "server_error" | "api_error" | "internal" | "internal_server_error" => Failure::Internal,
        "content_filter" | "safety" | "prohibited_content" | "recitation" => Failure::ContentFilter,
        "malformed_function_call" | "unexpected_tool_call" => Failure::ToolArguments,
        "cancelled" | "canceled" => Failure::Cancelled,
        _ => return None,
    })
}

pub(super) fn http_reason(status: u16) -> &'static str {
    match status {
        400 | 422 => "请求参数不被接受",
        401 => "认证失败，请检查密钥或登录状态",
        403 => "当前账户没有访问权限",
        404 => "模型或接口不存在",
        408 | 504 => "服务处理超时",
        413 => "请求内容过大",
        429 => "请求受到限流或配额限制",
        500 => "服务内部错误",
        502 => "上游网关无法完成请求",
        503 | 529 => "服务过载或暂不可用",
        300..=399 => "接口发生重定向，请检查地址和重定向设置",
        _ => "接口未返回成功状态",
    }
}

/// Upstream text can echo credentials and conversation content. Translate recognized codes
/// instead. Internally generated bridge failures retain their structured, safe cause.
pub(in crate::local_proxy) fn upstream(stage: Stage, value: &Value) -> RequestError {
    let error = value
        .get("error")
        .or_else(|| value.pointer("/response/error"))
        .unwrap_or(value);
    if let Some(known) = error
        .get("message")
        .and_then(Value::as_str)
        .and_then(RequestError::decode)
    {
        return known;
    }
    for key in ["code", "type", "status"] {
        if let Some(reason) = error.get(key).and_then(Value::as_str).and_then(classify) {
            return RequestError {
                stage,
                cause: Cause::Upstream(reason),
            };
        }
    }
    if let Some(status) = error
        .get("code")
        .and_then(Value::as_u64)
        .and_then(|code| u16::try_from(code).ok())
        .filter(|code| (400..600).contains(code))
    {
        return RequestError::http(stage, status);
    }
    RequestError {
        stage,
        cause: Cause::Upstream(Failure::Unknown),
    }
}
