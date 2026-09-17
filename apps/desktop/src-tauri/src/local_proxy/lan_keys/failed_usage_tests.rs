use super::*;
use std::io::{self, Cursor};

fn attach(fixture: &Fixture, payload: proxy::UpstreamPayload) -> proxy::UpstreamPayload {
    proxy::attach_token_usage_capture(
        fixture.app.handle(),
        Some(fixture.context("/v1/responses")),
        Ok(payload),
    )
    .unwrap()
}

fn streaming(reader: impl Read + Send + 'static) -> proxy::UpstreamPayload {
    proxy::UpstreamPayload {
        content_type: Some("text/event-stream".into()),
        body: proxy::UpstreamBody::Streaming(Box::new(reader)),
        ..proxy::json_payload(200, json!({}))
    }
}

fn assert_uncharged(fixture: &Fixture) {
    let usage = fixture.usage();
    assert_eq!(usage.tokens, 0);
    assert_eq!(usage.cost_usd, 0.0);
    assert_eq!(usage.unconfirmed_requests, 0);
}

#[test]
fn failed_http_and_json_responses_do_not_charge_or_require_review() {
    let fixture = Fixture::new();
    for status in [400, 429, 500, 503] {
        attach(
            &fixture,
            proxy::json_payload(status, json!({"error": {"message": "failure"}})),
        );
    }
    for failure in [
        json!({"error": {"message": "failure"}}),
        json!({"status": "failed"}),
    ] {
        let mut body = failure;
        body["usage"] = json!({"input_tokens": 20, "output_tokens": 5});
        attach(&fixture, proxy::json_payload(200, body));
    }
    assert_uncharged(&fixture);
}

#[test]
fn failed_buffered_and_streamed_events_do_not_charge_even_with_reported_usage() {
    let fixture = Fixture::new();
    let partial = "data: {\"usage\":{\"input_tokens\":20,\"output_tokens\":5}}\n\n";
    for ending in [
        "data: {\"type\":\"error\",\"error\":{\"message\":\"failure\"}}\n\n",
        "event: error\ndata: {\"message\":\"failure\"}\n\n",
        "data: {\"type\":\"response.failed\",\"response\":{\"usage\":{\"input_tokens\":20,\"output_tokens\":5}}}\n\n",
        "data: {\"type\":\"response.incomplete\"}\n\n",
        "",
    ] {
        let bytes = format!("{partial}{ending}").into_bytes();
        attach(&fixture, proxy::UpstreamPayload {
            content_type: Some("text/event-stream".into()),
            body: proxy::UpstreamBody::Buffered(bytes.clone()),
            ..proxy::json_payload(200, json!({}))
        });
        let mut payload = attach(&fixture, streaming(Cursor::new(bytes)));
        let proxy::UpstreamBody::Streaming(reader) = &mut payload.body else { panic!("expected stream") };
        reader.read_to_end(&mut Vec::new()).unwrap();
        drop(payload);
        assert_uncharged(&fixture);
    }
}

struct ReadFailure;
impl Read for ReadFailure {
    fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
        Err(io::Error::new(
            io::ErrorKind::ConnectionReset,
            "test disconnect",
        ))
    }
}

#[test]
fn read_errors_and_client_cancellations_do_not_charge() {
    let fixture = Fixture::new();
    let partial = b"data: {\"usage\":{\"input_tokens\":20,\"output_tokens\":5}}\n\n";
    let mut payload = attach(&fixture, streaming(Cursor::new(partial).chain(ReadFailure)));
    let proxy::UpstreamBody::Streaming(reader) = &mut payload.body else {
        panic!("expected stream")
    };
    assert!(reader.read_to_end(&mut Vec::new()).is_err());
    drop(payload);
    let mut payload = attach(&fixture, streaming(Cursor::new(partial)));
    let proxy::UpstreamBody::Streaming(reader) = &mut payload.body else {
        panic!("expected stream")
    };
    reader.read_exact(&mut vec![0; partial.len()]).unwrap();
    drop(payload);
    // Cancellation before the first read also must not create an unconfirmed request.
    drop(attach(&fixture, streaming(Cursor::new(partial))));
    assert_uncharged(&fixture);
}

#[test]
fn completed_stream_without_usage_counts_once() {
    let fixture = Fixture::new();
    let event = b"data: {\"type\":\"response.completed\",\"response\":{\"output\":[]}}\n\n";
    let mut payload = attach(&fixture, streaming(Cursor::new(event)));
    let proxy::UpstreamBody::Streaming(reader) = &mut payload.body else {
        panic!("expected stream")
    };
    reader.read_exact(&mut vec![0; event.len()]).unwrap();
    assert_eq!(fixture.usage().unconfirmed_requests, 1);
    reader.read_to_end(&mut Vec::new()).unwrap();
    drop(payload);
    assert_eq!(fixture.usage().unconfirmed_requests, 1);
}
