use super::*;
use serde_json::{json, Value};
use std::{io::Write, net::TcpListener, sync::mpsc, thread, time::Duration};
use tiny_http::{Header, Response, Server};

fn context(streaming: bool) -> Context {
    Context {
        model: "test".into(),
        tools: Default::default(),
        scope: None,
        streaming,
        previous: None,
    }
}

fn native() -> Value {
    json!({"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":"STOP"}],
        "usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}})
}

fn upstream(body: String, content_type: Option<&str>) -> ReqwestResponse {
    let server = Server::http("127.0.0.1:0").unwrap();
    let url = format!("http://{}", server.server_addr());
    let content_type = content_type.map(str::to_string);
    thread::spawn(move || {
        let request = server
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        let mut response = Response::from_string(body);
        if let Some(content_type) = content_type {
            response =
                response.with_header(Header::from_bytes("Content-Type", content_type).unwrap());
        }
        request.respond(response).unwrap();
    });
    crate::local_proxy::send_with_timeout_retries(
        || reqwest::blocking::Client::new().get(&url),
        "test",
    )
    .unwrap()
}

fn final_response(body: UpstreamBody) -> Value {
    match body {
        UpstreamBody::Buffered(bytes) => serde_json::from_slice(&bytes).unwrap(),
        UpstreamBody::Streaming(reader) => completed_response(reader).unwrap(),
    }
}

#[test]
fn native_events_keep_requested_shape_and_usage_with_missing_or_wrong_headers() {
    for content_type in [None, Some("application/json")] {
        for streaming in [false, true] {
            let events = format!("\u{feff}: keepalive\n\ndata: {}\n\n", native());
            let payload =
                receive(upstream(events, content_type), context(streaming), None).unwrap();
            assert_eq!(
                matches!(payload.body, UpstreamBody::Streaming(_)),
                streaming
            );
            let response = final_response(payload.body);
            assert_eq!(response["status"], "completed");
            assert_eq!(response["output"][0]["content"][0]["text"], "Hello");
            assert_eq!(response["usage"]["input_tokens"], 5);
        }
    }
}

#[test]
fn native_json_mislabeled_as_events_still_emits_complete_requested_stream() {
    let payload = receive(
        upstream(native().to_string(), Some("text/event-stream")),
        context(true),
        None,
    )
    .unwrap();
    let UpstreamBody::Streaming(reader) = payload.body else {
        panic!("expected stream")
    };
    let response = completed_response(reader).unwrap();
    assert_eq!(response["status"], "completed");
    assert_eq!(response["output"][0]["content"][0]["text"], "Hello");
}

#[test]
fn native_event_adapter_returns_before_the_upstream_stream_finishes() {
    let server = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", server.local_addr().unwrap());
    let (release, waiting) = mpsc::channel();
    let worker = thread::spawn(move || {
        let (mut socket, _) = server.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut headers = Vec::new();
        while !headers.ends_with(b"\r\n\r\n") {
            let mut byte = [0];
            socket.read_exact(&mut byte).unwrap();
            headers.push(byte[0]);
        }
        let first = "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}]}}]}\n\n";
        let last = "data: {\"candidates\":[{\"finishReason\":\"STOP\"}]}\n\n";
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{first}",
            first.len() + last.len()
        )
        .unwrap();
        socket.flush().unwrap();
        let returned_early = waiting.recv_timeout(Duration::from_secs(2)).is_ok();
        socket.write_all(last.as_bytes()).unwrap();
        returned_early
    });
    let response = crate::local_proxy::send_with_timeout_retries(
        || reqwest::blocking::Client::new().get(&url),
        "test",
    )
    .unwrap();
    let payload = receive(response, context(true), None).unwrap();
    release.send(()).unwrap();
    assert_eq!(final_response(payload.body)["status"], "completed");
    assert!(
        worker.join().unwrap(),
        "stream was buffered before returning"
    );
}
