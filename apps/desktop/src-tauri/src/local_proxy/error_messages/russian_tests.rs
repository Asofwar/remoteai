use std::{collections::HashSet, io};

use serde_json::json;

use super::*;
use crate::local_proxy::{
    error_capture::ErrorCapture,
    request_error::{self, russian::message, RequestError, Stage},
};
use crate::storage::{with_interface_language, InterfaceLanguage};

const INTERRUPTED: &str = "上游已结束传输，但没有发送完整的响应结束事件。";

fn assert_russian(text: &str) {
    assert!(
        text.chars().any(|c| matches!(c, 'А'..='я' | 'Ё' | 'ё')),
        "not Russian: {text}"
    );
    assert!(
        !text.chars().any(|c| matches!(
            c,
            '\u{3000}'..='\u{303f}' | '\u{3400}'..='\u{9fff}' | '\u{ff00}'..='\u{ffef}'
        )),
        "Chinese text left in: {text}"
    );
}

#[test]
fn transport_failures_render_in_russian_with_the_retry_count() {
    let failures: Vec<_> = transport_failures().collect();
    assert_eq!(failures.len(), 14);
    for failure in failures {
        assert_russian(failure.russian_message());
    }
    assert_eq!(
        message(&RequestError::transport(Stage::Read, "tls handshake eof")),
        format!(
            "Не удалось прочитать ответ сервиса. {}",
            TransportFailure::TlsClosed.russian_message()
        )
    );
    let timeout = TransportFailure::ConnectTimeout.russian_message();
    assert_eq!(
        gui("Messages request failed: operation timed out (attempts: 7)"),
        format!("{timeout} Попыток: 7.")
    );
    assert_eq!(
        gui("Provider proxy request failed: operation timed out (attempts: 1)"),
        timeout
    );
    let private = "Official Codex proxy request failed: error sending request for url \
        (https://user:password@example.com/?api_key=sk-private): tls handshake eof";
    assert_eq!(gui(private), TransportFailure::TlsClosed.russian_message());
}

#[test]
fn account_and_known_messages_cover_every_chinese_output() {
    for (chinese, russian) in ACCOUNT.iter().chain(KNOWN) {
        assert_russian(russian);
        assert!(!chinese.is_empty());
    }
    for (chinese, russian) in ACCOUNT {
        assert_eq!(gui(chinese), *russian);
    }
    let sources = [
        "The request body is not valid JSON",
        "Request parameters are invalid",
        "The request body must be a JSON object",
        "The request body must be an object",
        "Messages requests must use POST",
        "Content generation requests must use POST",
        "Chat bridge only supports POST requests",
        "A tool call contains invalid arguments",
        "A tool call or result contains invalid arguments",
        "An image uses an unsupported format",
        "An attached image or file uses an unsupported format",
        "The selected service cannot read this attachment format",
        "The request contains unsupported message content",
        "The output limit is too small for the selected thinking budget",
        "The output limit must be a positive integer",
        "Forced tool use cannot be combined with thinking",
        "The model name or service address is invalid",
        "The selected service cannot apply the requested search restrictions",
        "Generation settings must request exactly one response candidate",
        "The previous response is unavailable. Resend the conversation history or start a new conversation.",
        "The selected service cannot enforce this tool choice, call limit, or serial tool execution",
        "This endpoint only supports new responses",
        "This provider does not support this response operation",
        "Codex GUI only supports Codex requests",
        "Aggregate API is disabled",
        "Aggregate API member does not exist",
        "No active account is available for usage sync",
        "Codex account changed before the help request",
        "Missing help model",
        "The selected provider does not support the help model",
        "The selected aggregate does not support the help model",
        "路由设置已变更，请重试请求",
        "The selected service cannot apply the requested search restrictions. Remove these restrictions or choose a service that supports them.",
        "The selected service does not support built-in web search. Choose a service that supports web search.",
        "Provider group does not contain any available APIs",
        "Select an official account",
        "Select an official account before using the local proxy",
        "Select a non-Agent Identity OAuth account for image generation",
        "auth.json is missing tokens.access_token",
        "Concurrent account router lock is poisoned",
        "Managed proxy credential does not match the selected account",
        "Failed to read account directory: C:\\private",
        "Failed to read C:\\private\\auth.json",
        "Failed to parse C:\\private\\config.json",
        "Failed to write C:\\private\\config.json",
        "Failed to refresh tokens",
        "Unsupported HTTP method PATCH",
    ];
    let mut produced = HashSet::new();
    for source in sources {
        let chinese = super::super::known::message(source).expect(source);
        produced.insert(chinese);
        let text = gui(source);
        assert_russian(&text);
        assert!(!text.contains("private"), "{text}");
    }
    for (chinese, _) in KNOWN {
        assert!(produced.contains(chinese), "stale entry: {chinese}");
    }
    for failure in transport_failures() {
        assert_eq!(gui(failure.message()), failure.russian_message());
    }
}

#[test]
fn rendered_messages_stay_stable_and_unknown_errors_get_an_error_number() {
    for error in [
        "Chat bridge request failed: dns error: failed to lookup address information",
        "请先选择 Codex GUI 账户。",
        "账户设置已更新。",
        "Aggregate API is disabled",
    ] {
        let first = gui(error);
        assert_eq!(gui(&first), first);
    }
    for error in [
        "unexpected internal failure",
        "https://user:private@private.test/path",
        r"C:\Users\private\auth.json",
    ] {
        let text = gui(error);
        assert_russian(&text);
        assert!(text.contains(&format!("номер ошибки {}", super::super::error_id(error))));
        assert!(!text.contains("private"), "{text}");
    }
}

#[test]
fn structured_request_errors_render_every_cause_in_russian() {
    use request_error::Problem::*;
    let stages = [
        Stage::Request,
        Stage::Lite,
        Stage::Chat,
        Stage::Anthropic,
        Stage::Gemini,
        Stage::Responses,
        Stage::Read,
        Stage::Catalog,
        Stage::OutputLimit,
    ];
    let problems = [
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
    ];
    let mut errors = Vec::new();
    for stage in stages {
        errors.extend(problems.map(|problem| RequestError::new(stage, problem)));
        for status in [
            301, 400, 401, 403, 404, 408, 413, 418, 422, 429, 500, 502, 503, 504, 529,
        ] {
            errors.push(RequestError::http(stage, status));
        }
        for error in [
            serde_json::from_str::<serde_json::Value>("{\n\"private\":").unwrap_err(),
            serde_json::from_str::<serde_json::Value>("{\"password\":\"private\",!}").unwrap_err(),
            serde_json::from_str::<u8>("\"private\"").unwrap_err(),
        ] {
            errors.push(RequestError::json(stage, &error));
        }
        for (kind, detail) in [
            (io::ErrorKind::TimedOut, "private"),
            (io::ErrorKind::TimedOut, "catalog deadline"),
            (io::ErrorKind::ConnectionReset, "private"),
            (io::ErrorKind::BrokenPipe, "private"),
            (io::ErrorKind::UnexpectedEof, "private"),
            (io::ErrorKind::InvalidData, "private"),
            (io::ErrorKind::PermissionDenied, "private"),
        ] {
            errors.push(RequestError::io(stage, &io::Error::new(kind, detail)));
        }
        for code in [
            "authentication_error",
            "permission_error",
            "rate_limit_error",
            "insufficient_quota",
            "not_found_error",
            "context_length_exceeded",
            "request_too_large",
            "invalid_request_error",
            "overloaded_error",
            "timeout_error",
            "server_error",
            "content_filter",
            "malformed_function_call",
            "cancelled",
            "private_unknown_code",
        ] {
            let value = json!({"error": {"code": code, "message": "private prompt"}});
            errors.push(request_error::upstream(stage, &value));
        }
    }
    for error in errors {
        let text = message(&error);
        assert_russian(&text);
        assert!(text.starts_with("Не удалось "), "{text}");
        assert!(
            !text.contains("private") && !text.contains("password"),
            "{text}"
        );
    }
    let limit = message(&RequestError::http(Stage::OutputLimit, 404));
    assert!(limit.contains("HTTP 404"), "{limit}");
    assert!(limit.contains("max_tokens"), "{limit}");
    let syntax = serde_json::from_str::<serde_json::Value>("{,}").unwrap_err();
    let json = message(&RequestError::json(Stage::Request, &syntax));
    assert!(
        json.contains(&format!(
            "(строка {}, столбец {})",
            syntax.line(),
            syntax.column()
        )),
        "{json}"
    );
}

#[test]
fn saved_russian_language_reaches_display_gui_catalog_and_stream_texts() {
    let error = RequestError::new(Stage::Chat, request_error::Problem::MissingTerminal);
    let catalog = request_error::catalog_failure(
        RequestError::new(Stage::Catalog, request_error::Problem::CatalogInvalid),
        RequestError::http(Stage::Catalog, 503),
    );
    let stream_texts = [
        "Chat 响应包含不支持的 finish_reason，生成未正常完成。",
        "Chat 响应中的工具调用缺少名称，或参数 JSON 不完整。",
        INTERRUPTED,
    ];
    let chinese = (
        error.to_string(),
        super::super::gui(&catalog),
        stream_texts.map(super::super::localized),
    );
    assert!(
        chinese.0.starts_with("处理 Chat 响应失败："),
        "{}",
        chinese.0
    );
    assert!(chinese.1.starts_with("官方模型列表："), "{}", chinese.1);
    assert_eq!(chinese.2, stream_texts);

    with_interface_language(InterfaceLanguage::Ru, || {
        assert_eq!(error.to_string(), message(&error));
        assert_eq!(super::super::gui(&error.wire()), message(&error));
        let catalog = super::super::gui(&catalog);
        assert!(
            catalog.starts_with("Официальный список моделей: Не удалось "),
            "{catalog}"
        );
        assert!(
            catalog.contains(" Резервный список моделей: Не удалось "),
            "{catalog}"
        );
        assert_russian(&catalog);
        assert_eq!(
            super::super::gui("请先选择 Codex GUI 账户。"),
            "Сначала выберите аккаунт Codex GUI."
        );
        for text in stream_texts {
            let russian = super::super::localized(text);
            assert_russian(russian);
            assert_eq!(Some(russian), fixed(text));
        }
        assert_eq!(
            super::super::localized(INTERRUPTED),
            request_error::russian::problem_text(request_error::Problem::MissingTerminal)
        );
        let captured = ErrorCapture::new(true, 200).finish();
        assert_eq!(captured[0].message, super::super::localized(INTERRUPTED));
    });
    with_interface_language(InterfaceLanguage::En, || {
        assert_eq!(super::super::localized(INTERRUPTED), INTERRUPTED);
        assert_eq!(error.to_string(), chinese.0);
    });
}
