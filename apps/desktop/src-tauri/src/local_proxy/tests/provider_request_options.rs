#[test]
fn full_endpoint_and_native_messages_never_attempt_other_protocols() {
    for format in [ProviderApiFormat::OpenaiChat, ProviderApiFormat::AnthropicMessages] {
        let mut provider = fallback_test_provider();
        provider.api_format = format;
        provider.request_options = Some(crate::models::ProviderRequestOptions {
            use_full_url: true, ..Default::default()
        });
        let mut attempts = Vec::new();
        let result = forward_provider_api(&provider, br#"{"input":"ping"}"#, |attempt| {
            attempts.push(attempt);
            Ok(fallback_error_response(404, "unsupported endpoint"))
        }).unwrap();
        assert_eq!(result.status, 404);
        assert_eq!(attempts, [format]);
    }
}

#[test]
fn native_model_override_rejects_response_management_operations() {
    let mut provider = fallback_test_provider();
    provider.model_api_formats.insert(provider.model.clone(), ProviderApiFormat::AnthropicMessages);
    let result = forward_provider_request(&Method::Post, "/v1/responses/compact", &[],
        br#"{"input":"hello"}"#.to_vec(), &provider);
    assert_eq!(result.err().as_deref(), Some("This provider does not support this response operation"));
}

#[test]
fn exact_endpoint_rejects_get_requests_before_sending() {
    let mut provider = fallback_test_provider();
    provider.request_options = Some(crate::models::ProviderRequestOptions {
        use_full_url: true, ..Default::default()
    });
    let result = forward_provider_request(&Method::Get, "/v1/responses", &[], Vec::new(), &provider);
    assert_eq!(result.err().as_deref(), Some("This endpoint only supports new responses"));
}

#[test]
fn advanced_provider_settings_reach_exact_endpoint_after_chat_conversion() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let base_url = format!("http://{}/team/generate?version=2", server.server_addr());
    let worker = thread::spawn(move || {
        let mut request = server.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
        let header = request.headers().iter().find(|header| header.field.equiv("X-Region"))
            .map(|header| header.value.as_str().to_string());
        let captured = capture_chat_headers(&mut request);
        request.respond(Response::from_string(json!({
            "id":"chat_options", "choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]
        }).to_string()).with_header(Header::from_bytes("Content-Type", "application/json").unwrap())).unwrap();
        (header, captured)
    });
    let mut provider = fallback_test_provider();
    provider.base_url = base_url;
    provider.api_format = ProviderApiFormat::OpenaiChat;
    provider.request_options = Some(serde_json::from_value(json!({
        "useFullUrl": true, "headers": {"X-Region":"east"},
        "body": {"temperature":0.25,"extra":{"enabled":true}}
    })).unwrap());
    let response = forward_provider_request(&Method::Post, "/v1/responses", &[],
        br#"{"input":"hello","stream":false}"#.to_vec(), &provider).unwrap();
    assert_eq!(response.status, 200);
    let (header, captured) = worker.join().unwrap();
    assert_eq!(header.as_deref(), Some("east"));
    assert_eq!(captured.path, "/team/generate?version=2");
    assert_eq!(captured.authorization.as_deref(), Some("Bearer sk-upstream"));
    assert_eq!(captured.body["messages"][0]["content"], "hello");
    assert_eq!(captured.body["temperature"], 0.25);
    assert_eq!(captured.body["extra"]["enabled"], true);
    assert!(captured.body.get("input").is_none());
}
