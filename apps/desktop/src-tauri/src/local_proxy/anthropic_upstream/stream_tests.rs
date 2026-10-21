use std::io::{BufReader, Cursor, Read};

use serde_json::{json, Value};

use super::{continuation, stream::MessagesReader};

fn responses(events: Vec<Value>) -> String {
    let input = events
        .into_iter()
        .map(|event| format!("event: {}\ndata: {event}\n\n", event["type"]))
        .collect::<String>();
    convert_stream(&input)
}

fn convert_stream(input: &str) -> String {
    let native = MessagesReader::new(
        Cursor::new(input.as_bytes()),
        continuation::Scope::fixture("stream"),
    );
    let mut reader = super::super::ChatSseReader::new(
        BufReader::new(native),
        "claude".into(),
        super::super::CodexToolContext::default(),
        None,
    );
    let mut result = String::new();
    reader.read_to_string(&mut result).unwrap();
    result
}

#[test]
fn native_errors_keep_their_cause_after_messages_chat_responses_conversion() {
    for (input, expected) in [
        ("data: {\"type\":\"error\",\"error\":{\"type\":\"rate_limit_error\",\"message\":\"private\"}}\n\n",
            "频率或并发数"),
        ("data: {\n\n", "JSON 数据不完整"),
        ("data: {\"type\":\"content_block_start\"}\n\n", "index"),
        ("", "没有发送完整的响应结束事件"),
    ] {
        let output = convert_stream(input);
        assert!(output.contains("response.failed"), "{output}");
        assert!(output.contains(expected), "{output}");
        assert!(!output.contains("private"));
        assert!(!output.contains("proxy_request_error:"));
        assert!(!output.contains("response.completed"));
    }
}

#[test]
fn native_read_timeout_remains_a_timeout_after_conversion() {
    struct Timeout;
    impl Read for Timeout {
        fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
            Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "private"))
        }
    }
    let native = MessagesReader::new(
        BufReader::new(Timeout),
        continuation::Scope::fixture("timeout"),
    );
    let mut reader = super::super::ChatSseReader::new(
        BufReader::new(native),
        "claude".into(),
        Default::default(),
        None,
    );
    let mut output = String::new();
    reader.read_to_string(&mut output).unwrap();
    assert!(output.contains("等待后续数据超时"), "{output}");
    assert!(output.contains("Anthropic"));
    assert!(!output.contains("private"));
}

fn start() -> Value {
    json!({ "type": "message_start", "message": { "id": "msg", "model": "claude",
        "usage": { "input_tokens": 11, "output_tokens": 1, "cache_read_input_tokens": 4,
            "cache_creation_input_tokens": 5 } } })
}

fn complete(reason: &str) -> Vec<Value> {
    vec![
        json!({ "type": "message_delta", "delta": { "stop_reason": reason },
        "usage": { "output_tokens": 9 } }),
        json!({ "type": "message_stop" }),
    ]
}

#[test]
fn native_stream_accepts_events_and_content_above_previous_byte_limits() {
    let text = "x".repeat(8 * 1024 * 1024 + 1);
    let mut events = vec![
        start(),
        json!({"type":"content_block_start", "index":0,
        "content_block":{"type":"text", "text":""}}),
    ];
    for _ in 0..2 {
        events.push(json!({"type":"content_block_delta", "index":0,
            "delta":{"type":"text_delta", "text":text}}));
    }
    events.push(json!({"type":"content_block_stop", "index":0}));
    events.extend(complete("end_turn"));
    let result = terminal(&responses(events));
    assert_eq!(result["status"], "completed");
    assert_eq!(
        result["output"][0]["content"][0]["text"]
            .as_str()
            .unwrap()
            .len(),
        text.len() * 2
    );
}

#[test]
fn native_stream_accepts_more_than_1024_content_blocks() {
    let mut events = vec![start()];
    for index in 0..1025 {
        events.push(json!({"type":"content_block_start", "index":index,
            "content_block":{"type":"text", "text":"x"}}));
        events.push(json!({"type":"content_block_stop", "index":index}));
    }
    events.extend(complete("end_turn"));
    let result = terminal(&responses(events));
    assert_eq!(result["status"], "completed");
    assert_eq!(
        result["output"][0]["content"][0]["text"]
            .as_str()
            .unwrap()
            .len(),
        1025
    );
}

fn terminal(output: &str) -> Value {
    output
        .lines()
        .filter_map(|line| line.strip_prefix("data: "))
        .filter_map(|value| serde_json::from_str::<Value>(value).ok())
        .filter_map(|value| value.get("response").cloned())
        .next_back()
        .unwrap()
}

#[test]
fn native_stream_emits_text_thinking_tools_and_final_usage() {
    let mut events = vec![
        start(),
        json!({ "type": "content_block_start", "index": 0, "content_block": {
            "type": "thinking", "thinking": "" } }),
        json!({ "type": "content_block_delta", "index": 0,
            "delta": { "type": "thinking_delta", "thinking": "Plan" } }),
        json!({ "type": "content_block_delta", "index": 0,
            "delta": { "type": "signature_delta", "signature": "signed" } }),
        json!({ "type": "content_block_stop", "index": 0 }),
        json!({ "type": "content_block_start", "index": 1,
            "content_block": { "type": "text", "text": "Hello" } }),
        json!({ "type": "content_block_stop", "index": 1 }),
        json!({ "type": "content_block_start", "index": 2,
            "content_block": { "type": "tool_use", "id": "call", "name": "run", "input": {} } }),
        json!({ "type": "content_block_delta", "index": 2,
            "delta": { "type": "input_json_delta", "partial_json": "{\"x\":" } }),
        json!({ "type": "content_block_delta", "index": 2,
            "delta": { "type": "input_json_delta", "partial_json": "1}" } }),
        json!({ "type": "content_block_stop", "index": 2 }),
    ];
    events.extend(complete("tool_use"));
    let output = responses(events);
    assert!(output.contains("response.reasoning_summary_text.delta"));
    assert!(output.contains("response.function_call_arguments.delta"));
    assert!(!output.contains("signed"));
    let result = terminal(&output);
    assert_eq!(result["status"], "completed");
    assert_eq!(result["usage"]["input_tokens"], 20);
    assert_eq!(result["usage"]["output_tokens"], 9);
    assert_eq!(result["output"][2]["arguments"], "{\"x\":1}");
}

#[test]
fn native_stream_never_completes_on_truncation_or_error() {
    let mut truncated = vec![start()];
    truncated.extend(complete("end_turn").into_iter().take(1));
    for output in [
        responses(truncated),
        responses(vec![
            start(),
            json!({ "type": "error", "error": { "type": "overloaded_error" } }),
        ]),
        convert_stream("data: invalid\n\n"),
    ] {
        assert_eq!(terminal(&output)["status"], "failed");
        assert!(!output.contains("event: response.completed"));
    }
}

#[test]
fn native_stream_token_limit_remains_incomplete() {
    let mut events = vec![start()];
    events.extend(complete("max_tokens"));
    let output = responses(events);
    assert_eq!(terminal(&output)["status"], "incomplete");
    assert_eq!(
        terminal(&output)["incomplete_details"]["reason"],
        "max_output_tokens"
    );
}

#[test]
fn native_stream_rejects_incomplete_tool_arguments() {
    let mut events = vec![
        start(),
        json!({ "type": "content_block_start", "index": 0,
        "content_block": { "type": "tool_use", "id": "call", "name": "run", "input": {} } }),
        json!({ "type": "content_block_delta", "index": 0,
            "delta": { "type": "input_json_delta", "partial_json": "{\"x\":" } }),
        json!({ "type": "content_block_stop", "index": 0 }),
    ];
    events.extend(complete("tool_use"));
    assert_eq!(terminal(&responses(events))["status"], "failed");
}
