use serde_json::{json, Value};
use std::{io::Read, thread, time::Duration};
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

fn upstream(
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
        let capture = Capture {
            path: request.url().to_string(),
            headers: request
                .headers()
                .iter()
                .map(|h| (h.field.to_string(), h.value.to_string()))
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
    serde_json::from_value(json!({"id":uuid::Uuid::new_v4().to_string(),"name":"Native fixture",
        "baseUrl":base_url,"apiKey":"upstream-key","model":"gemini-3-flash","apiFormat":"geminiGenerateContent"})).unwrap()
}

fn response() -> String {
    json!({"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":"STOP"}],
        "usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}})
    .to_string()
}

#[test]
fn native_http_uses_content_endpoint_and_only_provider_authentication() {
    let (base, worker) = upstream(200, response(), "application/json");
    let headers = vec![
        ("Authorization".into(), "Bearer caller".into()),
        ("x-api-key".into(), "caller".into()),
        ("x-goog-api-key".into(), "caller".into()),
    ];
    let body = serde_json::to_vec(&json!({"input":"Hi"})).unwrap();
    let payload = super::super::forward_provider_request(
        &Method::Post,
        "/v1/responses",
        &headers,
        body,
        &provider(base),
    )
    .unwrap();
    let captured = worker.join().unwrap();
    assert_eq!(
        captured.path,
        "/v1beta/models/gemini-3-flash:generateContent"
    );
    assert_eq!(captured.header("x-goog-api-key"), Some("upstream-key"));
    assert_eq!(captured.header("authorization"), None);
    assert_eq!(captured.header("x-api-key"), None);
    assert_eq!(captured.body["contents"][0]["parts"][0]["text"], "Hi");
    let super::super::UpstreamBody::Buffered(body) = payload.body else {
        panic!("Expected JSON")
    };
    assert_eq!(
        serde_json::from_slice::<Value>(&body).unwrap()["output"][0]["content"][0]["text"],
        "Hello"
    );
}

#[test]
fn native_http_supports_complete_urls_headers_and_optional_generation_parameters() {
    let (base, worker) = upstream(200, response(), "application/json");
    let mut provider = provider(format!("{base}/invoke?revision=2"));
    provider.request_options = Some(
        serde_json::from_value(json!({"useFullUrl":true,
        "headers":{"x-workspace":"fixture"},"body":{"generationConfig":{"temperature":0.4}}}))
        .unwrap(),
    );
    super::forward(
        &Method::Post,
        &[],
        serde_json::to_vec(&json!({"input":"Hi"})).unwrap(),
        &provider,
    )
    .unwrap();
    let captured = worker.join().unwrap();
    assert_eq!(captured.path, "/invoke?revision=2");
    assert_eq!(captured.header("x-workspace"), Some("fixture"));
    assert_eq!(captured.body["generationConfig"]["candidateCount"], 1);
    assert_eq!(captured.body["generationConfig"]["temperature"], 0.4);
}

#[test]
fn native_http_stream_maps_parallel_tools_and_final_usage() {
    let (base, worker) = upstream(200, super::stream_tests::tool_stream(), "text/event-stream");
    let payload = super::forward(
        &Method::Post,
        &[],
        serde_json::to_vec(&json!({"input":"Hi","stream":true})).unwrap(),
        &provider(base),
    )
    .unwrap();
    let captured = worker.join().unwrap();
    assert_eq!(
        captured.path,
        "/v1beta/models/gemini-3-flash:streamGenerateContent?alt=sse"
    );
    let super::super::UpstreamBody::Streaming(mut reader) = payload.body else {
        panic!("Expected stream")
    };
    let mut output = String::new();
    reader.read_to_string(&mut output).unwrap();
    let final_response = super::stream_tests::terminal(&output);
    assert_eq!(final_response["status"], "completed");
    assert_eq!(final_response["usage"]["input_tokens"], 20);
    assert_eq!(final_response["usage"]["output_tokens"], 9);
    assert_eq!(
        final_response["output"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|v| v["type"] == "function_call")
            .count(),
        2
    );
}

#[test]
fn native_buffered_upstream_produces_complete_responses_event_sequence() {
    let (base, worker) = upstream(200, response(), "application/json");
    let payload = super::forward(
        &Method::Post,
        &[],
        serde_json::to_vec(&json!({"input":"Hi","stream":true})).unwrap(),
        &provider(base),
    )
    .unwrap();
    worker.join().unwrap();
    let super::super::UpstreamBody::Streaming(mut reader) = payload.body else {
        panic!("Expected stream")
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
            "Missing {event}"
        );
    }
}

#[test]
fn native_http_preserves_errors_without_protocol_fallback() {
    let (base, worker) = upstream(
        404,
        json!({"error":{"code":404}}).to_string(),
        "application/json",
    );
    let payload = super::super::forward_provider_request(
        &Method::Post,
        "/v1/responses",
        &[],
        serde_json::to_vec(&json!({"input":"Hi"})).unwrap(),
        &provider(base),
    )
    .unwrap();
    assert_eq!(payload.status, 404);
    assert_eq!(
        worker.join().unwrap().path,
        "/v1beta/models/gemini-3-flash:generateContent"
    );
}

fn conversation_upstream(stream: bool) -> (String, thread::JoinHandle<Vec<Value>>) {
    let server = Server::http("127.0.0.1:0").unwrap();
    let base = format!("http://{}", server.server_addr());
    let worker = thread::spawn(move || {
        let mut captured = Vec::new();
        for index in 0..2 {
            let mut request = server
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap();
            captured.push(serde_json::from_reader(request.as_reader()).unwrap());
            let native = if index == 0 {
                json!({"candidates":[{"content":{"parts":[
                    {"text":"","thoughtSignature":"signed-empty"},
                    {"functionCall":{"name":"run","args":{}},"thoughtSignature":"signed-call"}
                ]},"finishReason":"STOP"}]})
            } else {
                serde_json::from_str(&response()).unwrap()
            };
            let (body, content_type) = if index == 0 && stream {
                (format!("data: {native}\n\n"), "text/event-stream")
            } else {
                (native.to_string(), "application/json")
            };
            request
                .respond(
                    Response::from_string(body)
                        .with_header(Header::from_bytes("Content-Type", content_type).unwrap()),
                )
                .unwrap();
        }
        captured
    });
    (base, worker)
}

fn history_round_trip(stream: bool, use_cursor: bool) {
    let (base, worker) = conversation_upstream(stream);
    let provider = provider(base);
    let headers = vec![(
        "session-id".into(),
        format!("history-{}", uuid::Uuid::new_v4()),
    )];
    let first = json!({"input":"Read the original file", "instructions":"Keep the original rules",
        "stream":stream, "tools":[{"type":"function","name":"run","parameters":{"type":"object"}}]});
    let payload = super::forward(
        &Method::Post,
        &headers,
        serde_json::to_vec(&first).unwrap(),
        &provider,
    )
    .unwrap();
    let returned = match payload.body {
        super::super::UpstreamBody::Buffered(bytes) => {
            serde_json::from_slice::<Value>(&bytes).unwrap()
        }
        super::super::UpstreamBody::Streaming(mut reader) => {
            let mut output = String::new();
            reader.read_to_string(&mut output).unwrap();
            super::stream_tests::terminal(&output)
        }
    };
    let call = returned["output"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["type"] == "function_call")
        .unwrap();
    let mut next = json!({"input":[{"type":"function_call_output","call_id":call["call_id"],"output":"done"}]});
    if use_cursor {
        next["previous_response_id"] = returned["id"].clone();
    }
    super::forward(
        &Method::Post,
        &headers,
        serde_json::to_vec(&next).unwrap(),
        &provider,
    )
    .unwrap();
    let captured = worker.join().unwrap();
    assert_eq!(
        captured[1]["systemInstruction"],
        captured[0]["systemInstruction"]
    );
    assert_eq!(
        captured[1]["contents"][0]["parts"][0]["text"],
        "Read the original file"
    );
    assert_eq!(
        captured[1]["contents"][1]["parts"][0]["thoughtSignature"],
        "signed-empty"
    );
    assert_eq!(
        captured[1]["contents"][1]["parts"][1]["thoughtSignature"],
        "signed-call"
    );
    assert!(captured[1]["contents"][1]["parts"][1]["functionCall"]
        .get("id")
        .is_none());
    assert_eq!(
        captured[1]["contents"][2]["parts"][0]["functionResponse"]["name"],
        "run"
    );
    assert_eq!(captured[1]["tools"], captured[0]["tools"]);
}

#[test]
fn native_http_previous_response_restores_complete_signed_conversation() {
    history_round_trip(false, true);
}

#[test]
fn native_http_stream_history_restores_tool_result_only_followup() {
    history_round_trip(true, false);
}
