//! Safe, structured causes carried through legacy String-based request APIs.
//! Only enums and numeric positions cross this boundary; never embed request bodies or URLs.
use serde::{Deserialize, Serialize};
use std::{fmt, io};

pub(super) mod russian;
mod upstream;
pub(super) use upstream::upstream;

const PREFIX: &str = "proxy_request_error:";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum Stage {
    Request,
    Lite,
    Chat,
    Anthropic,
    Gemini,
    Responses,
    Read,
    Catalog,
    OutputLimit,
}

impl Stage {
    fn label(self) -> &'static str {
        match self {
            Self::Request => "读取请求",
            Self::Lite => "处理 Responses Lite 请求",
            Self::Chat => "处理 Chat 响应",
            Self::Anthropic => "处理 Anthropic 响应",
            Self::Gemini => "处理 Gemini 响应",
            Self::Responses => "处理 Responses 响应",
            Self::Read => "读取上游响应",
            Self::Catalog => "读取模型列表",
            Self::OutputLimit => "查询模型最大输出长度",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum Problem {
    ObjectRequired,
    ReasoningObject,
    UnsupportedEncoding,
    GzipDecode,
    ZstdDecode,
    Encode,
    Framing,
    MissingChoices,
    MissingTerminal,
    MissingEventType,
    EventTypeMismatch,
    InvalidEvent,
    MissingBlockIndex,
    BlockOrder,
    UnknownBlock,
    BlockDelta,
    DeltaText,
    ToolArguments,
    MissingStopReason,
    UnclosedBlock,
    MissingContent,
    InvalidTool,
    UnsupportedResponseContent,
    Incomplete,
    ContentFilter,
    InvalidModel,
    ModelEndpoint,
    MissingMaximum,
    InvalidMaximum,
    Prepare,
    CatalogSettings,
    CatalogAddress,
    CatalogInvalid,
    MissingItem,
    MissingItemId,
    MissingResponse,
    ResponseStatus,
    ContentMismatch,
}

impl Problem {
    fn message(self) -> &'static str {
        match self {
            Self::ObjectRequired => "请求正文必须是 JSON 对象。",
            Self::ReasoningObject => "reasoning 必须是 JSON 对象或 null。",
            Self::UnsupportedEncoding => "不支持此请求压缩格式；支持 identity、gzip 和 zstd。",
            Self::GzipDecode => "gzip 请求解压失败，压缩数据已损坏或不完整。",
            Self::ZstdDecode => "zstd 请求解压失败，压缩数据已损坏或不完整。",
            Self::Encode => "无法将转换后的内容编码为响应格式。",
            Self::Framing => "上游返回的内容不是可识别的 JSON 或 SSE，请检查 Provider 的接口类型。",
            Self::MissingChoices => "上游 JSON 缺少 choices[0].message。",
            Self::MissingTerminal => "上游已结束传输，但没有发送完整的响应结束事件。",
            Self::MissingEventType => "事件缺少 type，且未提供 SSE event 名称。",
            Self::EventTypeMismatch => "SSE event 名称与 JSON 中的 type 不一致。",
            Self::InvalidEvent => "事件字段或顺序不符合所选接口格式，请检查 Provider 的接口类型。",
            Self::MissingBlockIndex => "内容事件缺少有效的非负整数 index。",
            Self::BlockOrder => "内容块尚未开始、已结束或被重复创建。",
            Self::UnknownBlock => "上游返回了不支持的内容块类型。",
            Self::BlockDelta => "内容增量类型与所属内容块不匹配。",
            Self::DeltaText => "内容增量缺少有效的文本字符串。",
            Self::ToolArguments => "工具调用参数不是有效的 JSON 对象。",
            Self::MissingStopReason => "上游未提供有效的结束原因或消息开始事件。",
            Self::UnclosedBlock => "消息已结束，但仍有内容块未结束。",
            Self::MissingContent => "上游消息缺少 content 数组或有效的消息类型。",
            Self::InvalidTool => "工具调用缺少名称、标识或有效的参数对象。",
            Self::UnsupportedResponseContent => "上游返回了当前接口无法转换的图片、文件或内容块。",
            Self::Incomplete => "上游明确标记响应未完成。",
            Self::ContentFilter => "上游因内容审核停止生成。",
            Self::InvalidModel => "请求缺少有效的 model，请先选择模型。",
            Self::ModelEndpoint => "无法从当前服务地址确定模型信息接口。",
            Self::MissingMaximum => "上游模型信息未提供有效的正整数 max_tokens。",
            Self::InvalidMaximum => {
                "输出长度必须为正整数，请检查请求或 Provider 中的 max_tokens 设置。"
            }
            Self::Prepare => "无法创建上游请求，请检查服务地址和自定义请求头。",
            Self::CatalogSettings => "无法读取模型列表服务设置。",
            Self::CatalogAddress => "模型列表服务地址无效。",
            Self::CatalogInvalid => "模型列表缺少有效的 models 数组、模型名称或可见模型。",
            Self::MissingItem => "输出事件缺少 item 对象。",
            Self::MissingItemId => "输出内容缺少有效的 id。",
            Self::MissingResponse => "结束事件缺少 response 对象。",
            Self::ResponseStatus => "结束事件与 response.status 不一致。",
            Self::ContentMismatch => "最终内容与此前发送的内容增量不一致。",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum JsonKind {
    Syntax,
    Eof,
    Data,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum ReadFailure {
    Timeout,
    Deadline,
    Reset,
    Closed,
    Eof,
    InvalidData,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum Cause {
    Problem(Problem),
    Json {
        kind: JsonKind,
        line: usize,
        column: usize,
    },
    Read(ReadFailure),
    Http(u16),
    Upstream(upstream::Failure),
    Transport(super::error_messages::TransportFailure),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct RequestError {
    stage: Stage,
    cause: Cause,
}

impl RequestError {
    pub(super) fn new(stage: Stage, problem: Problem) -> Self {
        Self {
            stage,
            cause: Cause::Problem(problem),
        }
    }

    pub(super) fn http(stage: Stage, status: u16) -> Self {
        Self {
            stage,
            cause: Cause::Http(status),
        }
    }

    pub(super) fn transport(stage: Stage, detail: &str) -> Self {
        Self {
            stage,
            cause: Cause::Transport(super::error_messages::TransportFailure::classify(
                &detail.to_ascii_lowercase(),
            )),
        }
    }

    pub(super) fn json(stage: Stage, error: &serde_json::Error) -> Self {
        if let Some(kind) = error.io_error_kind() {
            return Self::io(stage, &io::Error::from(kind));
        }
        let kind = match error.classify() {
            serde_json::error::Category::Eof => JsonKind::Eof,
            serde_json::error::Category::Data => JsonKind::Data,
            _ => JsonKind::Syntax,
        };
        Self {
            stage,
            cause: Cause::Json {
                kind,
                line: error.line(),
                column: error.column(),
            },
        }
    }

    pub(super) fn io(stage: Stage, error: &io::Error) -> Self {
        if let Some(known) = error
            .get_ref()
            .and_then(|inner| inner.downcast_ref::<Self>())
        {
            return *known;
        }
        if let Some(known) = error
            .get_ref()
            .and_then(|inner| inner.downcast_ref::<reqwest::Error>())
            .and_then(|source| Self::http_read(stage, source))
        {
            return known;
        }
        let kind = match error.kind() {
            io::ErrorKind::TimedOut if error.to_string().contains("catalog deadline") => {
                ReadFailure::Deadline
            }
            io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock => ReadFailure::Timeout,
            io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionAborted => ReadFailure::Reset,
            io::ErrorKind::BrokenPipe | io::ErrorKind::NotConnected => ReadFailure::Closed,
            io::ErrorKind::UnexpectedEof => ReadFailure::Eof,
            io::ErrorKind::InvalidData => ReadFailure::InvalidData,
            _ => ReadFailure::Other,
        };
        Self {
            stage,
            cause: Cause::Read(kind),
        }
    }

    fn http_read(stage: Stage, source: &reqwest::Error) -> Option<Self> {
        if source.is_timeout() {
            return Some(Self {
                stage,
                cause: Cause::Read(ReadFailure::Timeout),
            });
        }
        let detail = crate::local_proxy::diagnostic_error_causes(source)
            .join(": ")
            .to_ascii_lowercase();
        if [
            "connection reset",
            "connection closed",
            "broken pipe",
            "tls",
            "certificate",
            "os error 10054",
        ]
        .iter()
        .any(|marker| detail.contains(marker))
        {
            return Some(Self::transport(stage, &detail));
        }
        if detail.contains("unexpected eof") || detail.contains("incomplete message") {
            return Some(Self {
                stage,
                cause: Cause::Read(ReadFailure::Eof),
            });
        }
        None
    }

    /// Keep provenance when an error passes through String APIs or an intermediate SSE bridge.
    pub(super) fn wire(self) -> String {
        match serde_json::to_string(&self) {
            Ok(value) => format!("{PREFIX}{value}"),
            Err(_) => self.to_string(),
        }
    }

    pub(super) fn decode(value: &str) -> Option<Self> {
        serde_json::from_str(value.strip_prefix(PREFIX)?).ok()
    }
}

impl fmt::Display for RequestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if crate::storage::interface_language() == crate::storage::InterfaceLanguage::Ru {
            return russian::fmt(self, f);
        }
        write!(f, "{}失败：", self.stage.label())?;
        match self.cause {
            Cause::Problem(problem) => f.write_str(problem.message())?,
            Cause::Json { kind, line, column } => {
                let reason = match kind {
                    JsonKind::Syntax => "JSON 语法无效",
                    JsonKind::Eof => "JSON 数据不完整",
                    JsonKind::Data => "JSON 字段类型不符合要求",
                };
                write!(f, "{reason}（第 {line} 行，第 {column} 列）。")?;
            }
            Cause::Read(kind) => f.write_str(match kind {
                ReadFailure::Timeout => "等待后续数据超时，连续无数据时间已达到当前设置。",
                ReadFailure::Deadline => "模型信息查询已超过等待时限。",
                ReadFailure::Reset => "传输连接被重置。",
                ReadFailure::Closed => "传输连接已关闭。",
                ReadFailure::Eof => "连接提前结束，响应正文不完整。",
                ReadFailure::InvalidData => "传输数据编码无效或正文已损坏。",
                ReadFailure::Other => "读取响应正文时发生网络传输错误。",
            })?,
            Cause::Http(status) => write!(
                f,
                "上游返回 HTTP {status}，{}。",
                upstream::http_reason(status)
            )?,
            Cause::Upstream(reason) => f.write_str(reason.message())?,
            Cause::Transport(reason) => f.write_str(reason.message())?,
        }
        if self.stage == Stage::OutputLimit && self.cause != Cause::Problem(Problem::InvalidMaximum)
        {
            f.write_str(
                "请检查上游服务，或在 Provider 的自定义请求参数中设置 max_tokens 后重试。",
            )?;
        }
        Ok(())
    }
}

impl std::error::Error for RequestError {}

/// Both catalog sources matter when automatic fallback fails.
pub(super) fn catalog_failure(official: RequestError, admin: RequestError) -> String {
    match serde_json::to_string(&(official, admin)) {
        Ok(value) => format!("proxy_catalog_error:{value}"),
        Err(_) => official.wire(),
    }
}

pub(super) fn catalog_message(value: &str) -> Option<String> {
    let (official, admin): (RequestError, RequestError) =
        serde_json::from_str(value.strip_prefix("proxy_catalog_error:")?).ok()?;
    if crate::storage::interface_language() == crate::storage::InterfaceLanguage::Ru {
        return Some(russian::catalog(&official, &admin));
    }
    Some(format!("官方模型列表：{official} 备用模型列表：{admin}"))
}

#[cfg(test)]
mod tests;
