use std::{io::Read, thread, time::Duration};

use serde_json::{json, Value};
use tiny_http::{Header, Method, Response, Server, StatusCode};

use crate::models::ProviderProfile;

struct Capture {
    path: String,
    headers: Vec<(String, String)>,
    body: Value,
}

impl Capture {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

fn upstream(status: u16) -> (String, thread::JoinHandle<Capture>) {
    let body = if status == 200 {
        json!({ "id": "native", "model": "claude-test", "stop_reason": "end_turn",
            "content": [{ "type": "text", "text": "Hello" }],
            "usage": { "input_tokens": 3, "output_tokens": 2 } })
    } else {
        json!({ "type": "error", "error": { "type": "not_found_error", "message": "Not found" } })
    };
    upstream_response(status, body.to_string(), "application/json")
}

fn upstream_response(
    status: u16,
    body: String,
    content_type: &'static str,
) -> (String, thread::JoinHandle<Capture>) {
    let server = Server::http("127.0.0.1:0").unwrap();
    let base_url = format!("http://{}", server.server_addr());
    let worker = thread::spawn(move || {
        let mut request = server
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        if request.method() == &Method::Get {
            assert!(request.url().contains("/models/"));
            request
                .respond(Response::from_string(r#"{"max_tokens":128000}"#))
                .unwrap();
            request = server
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap();
        }
        let capture = Capture {
            path: request.url().to_string(),
            headers: request
                .headers()
                .iter()
                .map(|header| (header.field.to_string(), header.value.to_string()))
                .collect(),
            body: serde_json::from_reader(request.as_reader()).unwrap(),
        };
        request
            .respond(
                Response::from_string(body)
                    .with_status_code(StatusCode(status))
                    .with_header(Header::from_bytes("Content-Type", content_type).unwrap()),
            )
            .unwrap();
        capture
    });
    (base_url, worker)
}

fn provider(base_url: String) -> ProviderProfile {
    serde_json::from_value(
        json!({ "id": uuid::Uuid::new_v4().to_string(), "name": "Messages fixture",
        "baseUrl": base_url, "apiKey": "upstream-key", "model": "claude-test",
        "apiFormat": "anthropicMessages" }),
    )
    .unwrap()
}

#[test]
fn native_http_uses_messages_path_and_provider_authentication() {
    let (base_url, worker) = upstream(200);
    let provider = provider(base_url);
    let headers = vec![
        ("Authorization".into(), "Bearer caller-token".into()),
        ("x-api-key".into(), "caller-key".into()),
        ("anthropic-version".into(), "old-version".into()),
    ];
    let body = serde_json::to_vec(&json!({ "input": "Hi", "stream": false })).unwrap();
    let payload = super::super::forward_provider_request(
        &Method::Post,
        "/v1/responses",
        &headers,
        body,
        &provider,
    )
    .unwrap();
    let capture = worker.join().unwrap();
    assert_eq!(capture.path, "/v1/messages");
    assert_eq!(capture.body["max_tokens"], 128_000);
    assert_eq!(capture.header("x-api-key"), Some("upstream-key"));
    assert_eq!(capture.header("anthropic-version"), Some("2023-06-01"));
    assert_eq!(capture.header("authorization"), None);
    assert_eq!(capture.body["messages"][0]["content"][0]["text"], "Hi");
    assert_eq!(payload.status, 200);
    let super::super::UpstreamBody::Buffered(body) = payload.body else {
        panic!("Expected JSON")
    };
    assert_eq!(
        serde_json::from_slice::<Value>(&body).unwrap()["output"][0]["content"][0]["text"],
        "Hello"
    );
}

#[test]
fn native_http_applies_full_url_headers_and_bounded_thinking_overrides() {
    let (base_url, worker) = upstream(200);
    let mut provider = provider(format!("{base_url}/gateway/invoke?revision=2"));
    provider.model = "claude-sonnet-4-20250514".into();
    provider.request_options = Some(serde_json::from_value(json!({
        "useFullUrl": true, "headers": { "x-workspace": "fixture" }, "body": { "max_tokens": 2_000 }
    })).unwrap());
    let body =
        serde_json::to_vec(&json!({ "input": "Hi", "reasoning": { "effort": "high" } })).unwrap();
    super::forward(&Method::Post, &[], body, &provider).unwrap();
    let capture = worker.join().unwrap();
    assert_eq!(capture.path, "/gateway/invoke?revision=2");
    assert_eq!(capture.header("x-workspace"), Some("fixture"));
    assert_eq!(capture.body["max_tokens"], 2_000);
    assert_eq!(capture.body["thinking"]["budget_tokens"], 1_999);
}

#[test]
fn native_http_preserves_errors_without_trying_another_protocol() {
    let (base_url, worker) = upstream(404);
    let provider = provider(base_url);
    let body = serde_json::to_vec(&json!({ "input": "Hi" })).unwrap();
    let payload = super::super::forward_provider_request(
        &Method::Post,
        "/v1/responses",
        &[],
        body,
        &provider,
    )
    .unwrap();
    let capture = worker.join().unwrap();
    assert_eq!(capture.path, "/v1/messages");
    assert_eq!(payload.status, 404);
}

#[test]
fn native_buffered_upstream_produces_all_streaming_response_events() {
    let (base_url, worker) = upstream(200);
    let provider = provider(base_url);
    let body = serde_json::to_vec(&json!({ "input": "Hi", "stream": true })).unwrap();
    let payload = super::forward(&Method::Post, &[], body, &provider).unwrap();
    worker.join().unwrap();
    let super::super::UpstreamBody::Streaming(mut reader) = payload.body else {
        panic!("Expected a stream")
    };
    let mut output = String::new();
    reader.read_to_string(&mut output).unwrap();
    for event in [
        "response.created",
        "response.output_item.added",
        "response.content_part.added",
        "response.output_text.delta",
        "response.output_text.done",
        "response.output_item.done",
        "response.completed",
    ] {
        assert!(
            output.contains(&format!("event: {event}\n")),
            "Missing event {event}"
        );
    }
    assert!(output.contains("Hello"));
}

#[test]
fn native_client_preserves_signatures_cache_controls_and_server_tools() {
    let (base_url, worker) = upstream(200);
    let mut provider = provider(base_url);
    provider.api_format = crate::models::ProviderApiFormat::OpenaiResponses;
    provider.model_api_formats.insert(
        provider.model.clone(),
        crate::models::ProviderApiFormat::AnthropicMessages,
    );
    let mut request = json!({ "model": "client-alias", "max_tokens": 4_096,
        "tools": [{ "type": "web_search_20250305", "name": "web_search", "allowed_domains": ["example.com"] }],
        "system": [{ "type": "text", "text": "Rules", "cache_control": { "type": "ephemeral" } }],
        "messages": [{ "role": "assistant", "content": [
            { "type": "thinking", "thinking": "Plan", "signature": "signed-original" },
            { "type": "tool_use", "id": "call", "name": "run", "input": {} }
        ] }] });
    let headers = vec![
        ("anthropic-beta".into(), "advanced-tools-2026-01-01".into()),
        ("Authorization".into(), "Bearer caller-key".into()),
    ];
    let payload = super::super::forward_anthropic_provider_with_context(
        serde_json::to_vec(&request).unwrap(),
        &provider,
        "",
        super::super::AnthropicProviderContext {
            headers: &headers,
            session_id: Some("native-session"),
        },
    )
    .unwrap();
    let capture = worker.join().unwrap();
    request["model"] = json!(provider.model);
    assert_eq!(capture.body, request);
    assert_eq!(capture.header("x-api-key"), Some("upstream-key"));
    assert_eq!(
        capture.header("anthropic-beta"),
        Some("advanced-tools-2026-01-01")
    );
    assert_eq!(capture.header("authorization"), None);
    assert_eq!(payload.status, 200);
    let super::super::UpstreamBody::Buffered(body) = payload.body else {
        panic!("Expected JSON")
    };
    let returned: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(returned["content"][0]["text"], "Hello");
    assert!(returned.get("output").is_none());
}

#[test]
fn native_client_stream_is_forwarded_without_rewriting_blocks() {
    let stream = concat!(
        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg\"}}\n\n",
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,",
        "\"content_block\":{\"type\":\"redacted_thinking\",\"data\":\"opaque\"}}\n\n"
    );
    let (base_url, worker) = upstream_response(200, stream.to_string(), "text/event-stream");
    let provider = provider(base_url);
    let request = json!({ "model": "client", "max_tokens": 4_096, "stream": true,
        "messages": [{ "role": "user", "content": "Hi" }] });
    let payload = super::super::forward_anthropic_provider(
        serde_json::to_vec(&request).unwrap(),
        &provider,
        "",
        Some("native-session"),
    )
    .unwrap();
    worker.join().unwrap();
    let super::super::UpstreamBody::Streaming(mut reader) = payload.body else {
        panic!("Expected stream")
    };
    let mut returned = String::new();
    reader.read_to_string(&mut returned).unwrap();
    assert_eq!(returned, stream);
}
