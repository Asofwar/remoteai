use super::{streaming::AnswerStream, transport, types::MAX_ANSWER_CHARS};
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn delta(text: &str) -> String {
    format!(
        "data: {}\r\n\r\n",
        json!({"type": "response.output_text.delta", "delta": text})
    )
}

#[test]
fn streams_split_utf8_and_json_without_exposing_reasoning() {
    let mut stream = AnswerStream::default();
    let mut updates = Vec::new();
    let bytes = format!(
        ": keepalive\r\ndata: {}\r\n\r\n{}{}data: [DONE]\r\n\r\n",
        json!({"type": "response.reasoning_text.delta", "delta": "private reasoning"}),
        delta("你好"),
        delta("，世界！"),
    );
    for byte in bytes.as_bytes() {
        stream
            .push(&[*byte], &mut |text| updates.push(text.to_owned()))
            .unwrap();
    }
    assert_eq!(updates, ["你好", "你好，世界！"]);
}

#[test]
fn rejects_oversized_and_invalid_deltas() {
    let mut stream = AnswerStream::default();
    assert!(stream
        .push(
            delta(&"界".repeat(MAX_ANSWER_CHARS + 1)).as_bytes(),
            &mut |_| {}
        )
        .is_err());
    let mut stream = AnswerStream::default();
    assert!(stream.push(b"data: {invalid}\n", &mut |_| {}).is_err());
    let mut request = super::tests::request();
    request.request_id = Some("e0a463fdb7f046d7b5f929318ad5731a".into());
    assert!(request.validate().is_ok());
    request.request_id = Some("not-a-request-id".into());
    assert!(request.validate().is_err());
}

async fn read_http_request(socket: &mut tokio::net::TcpStream) {
    let mut headers = Vec::new();
    while !headers.ends_with(b"\r\n\r\n") {
        assert!(headers.len() < 8192);
        headers.push(socket.read_u8().await.unwrap());
    }
    let headers = String::from_utf8(headers).unwrap();
    let length = headers
        .lines()
        .filter_map(|line| line.split_once(':'))
        .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
        .map(|(_, value)| value.trim().parse::<usize>().unwrap())
        .unwrap();
    socket.read_exact(&mut vec![0; length]).await.unwrap();
}

#[tokio::test]
async fn transport_delivers_progress_before_the_response_finishes() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (release, ready) = tokio::sync::oneshot::channel();
    let worker = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        read_http_request(&mut socket).await;
        let first = delta("你好");
        let last = format!(
            "data: {}\n\n",
            json!({"type": "response.completed", "response": {
            "status": "completed", "output": [{"type": "message", "content": [
                {"type": "output_text", "text": "你好，世界！"}]}]}})
        );
        let headers = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\n\r\n",
            first.len() + last.len(),
        );
        socket.write_all(headers.as_bytes()).await.unwrap();
        socket.write_all(first.as_bytes()).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), ready)
            .await
            .unwrap()
            .unwrap();
        socket.write_all(last.as_bytes()).await.unwrap();
    });
    let mut release = Some(release);
    let mut updates = Vec::new();
    let answer =
        transport::answer_streaming(&format!("http://{address}"), json!({}), 7, &mut |text| {
            updates.push(text.to_owned());
            if let Some(release) = release.take() {
                release.send(()).unwrap();
            }
        })
        .await
        .unwrap();
    assert_eq!(updates, ["你好"]);
    assert_eq!(answer, "你好，世界！");
    worker.await.unwrap();
}

#[test]
fn incomplete_stream_is_not_accepted_as_a_finished_answer() {
    assert!(transport::parse_response(delta("partial").as_bytes()).is_err());
    let failed = format!(
        "{}data: {}\n\n",
        delta("partial"),
        json!({"type": "response.failed"})
    );
    assert!(transport::parse_response(failed.as_bytes()).is_err());
}
