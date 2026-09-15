struct ChatHeaderCapture {
    path: String,
    content_types: Vec<String>,
    authorization: Option<String>,
    session_id: Option<String>,
    body: Value,
}

fn capture_chat_headers(request: &mut tiny_http::Request) -> ChatHeaderCapture {
    let header_value = |name: &str| {
        request
            .headers()
            .iter()
            .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
            .map(|header| header.value.as_str().to_string())
    };
    let mut capture = ChatHeaderCapture {
        path: request.url().to_string(),
        content_types: request
            .headers()
            .iter()
            .filter(|header| header.field.equiv("Content-Type"))
            .map(|header| header.value.as_str().to_string())
            .collect(),
        authorization: header_value("authorization"),
        session_id: header_value("session-id"),
        body: Value::Null,
    };
    capture.body = serde_json::from_reader(request.as_reader()).unwrap();
    capture
}

fn spawn_chat_header_upstream(
    fallback: bool,
) -> (String, thread::JoinHandle<Vec<ChatHeaderCapture>>) {
    let server = Server::http("127.0.0.1:0").unwrap();
    let base_url = format!("http://{}", server.server_addr());
    let worker =
        thread::spawn(move || {
            let mut captures = Vec::new();
            for attempt in 0..=usize::from(fallback) {
                let mut request = server
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap()
                    .unwrap();
                captures.push(capture_chat_headers(&mut request));
                let response = if fallback && attempt == 0 {
                    Response::from_string(r#"{"error":{"message":"unsupported endpoint"}}"#)
                        .with_status_code(StatusCode(404))
                } else {
                    Response::from_string(json!({
                    "id": "chatcmpl_headers", "model": "gpt-5.6-sol",
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"},
                        "finish_reason": "stop"}]
                }).to_string())
                };
                request
                    .respond(response.with_header(
                        Header::from_bytes("Content-Type", "application/json").unwrap(),
                    ))
                    .unwrap();
            }
            captures
        });
    (base_url, worker)
}

fn assert_chat_bridge_content_type(content_type: Option<&str>, fallback: bool) {
    let (base_url, worker) = spawn_chat_header_upstream(fallback);
    let mut provider = openai_provider(base_url);
    provider.id = uuid::Uuid::new_v4().to_string();
    provider.kind = ProviderKind::Custom;
    if !fallback {
        provider
            .model_api_formats
            .insert(provider.model.clone(), ProviderApiFormat::OpenaiChat);
    }
    let mut headers = vec![
        ("Authorization".to_string(), "Bearer client-key".to_string()),
        ("session-id".to_string(), "header-regression".to_string()),
    ];
    if let Some(content_type) = content_type {
        headers.push(("cOnTeNt-TyPe".to_string(), content_type.to_string()));
    }
    let body =
        serde_json::to_vec(&json!({"model": provider.model, "input": "ping", "stream": false}))
            .unwrap();
    let payload =
        forward_provider_request(&Method::Post, "/v1/responses", &headers, body, &provider)
            .unwrap();
    let captures = worker.join().unwrap();
    assert_eq!(payload.status, 200);
    let chat = captures.last().unwrap();
    assert_eq!(chat.path, "/v1/chat/completions");
    assert_eq!(
        chat.content_types,
        vec![content_type.unwrap_or("application/json")]
    );
    assert_eq!(chat.authorization.as_deref(), Some("Bearer sk-upstream"));
    assert_eq!(chat.session_id.as_deref(), Some("header-regression"));
    assert_eq!(chat.body["messages"][0]["content"], "ping");
    assert!(chat.body.get("input").is_none());
    if fallback {
        assert_eq!(captures[0].path, "/v1/responses");
        assert_eq!(captures[0].body["input"], "ping");
    }
}

#[test]
fn chat_bridge_sends_one_content_type_on_direct_and_fallback_requests() {
    for fallback in [false, true] {
        for content_type in [
            Some("application/json"),
            Some("application/json; charset=utf-8"),
            None,
        ] {
            assert_chat_bridge_content_type(content_type, fallback);
        }
    }
}
