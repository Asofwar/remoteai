struct AggregateTestServer {
    url: String,
    calls: std::sync::Arc<AtomicUsize>,
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
    requests: std::sync::Arc<std::sync::Mutex<Vec<(String, Value)>>>,
    auth_headers: std::sync::Arc<std::sync::Mutex<Vec<HashMap<String, String>>>>,
}

impl AggregateTestServer {
    fn new(status: u16, body: &str, headers: Vec<(&str, &str)>) -> Self {
        let server = Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://{}", server.server_addr());
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let worker_calls = calls.clone();
        let worker_stop = stop.clone();
        let requests = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let worker_requests = requests.clone();
        let auth_headers = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let worker_headers = auth_headers.clone();
        let body = body.to_string();
        let headers = headers
            .into_iter()
            .map(|(name, value)| Header::from_bytes(name, value).unwrap())
            .collect::<Vec<_>>();
        let worker = thread::spawn(move || {
            while !worker_stop.load(AtomicOrdering::SeqCst) {
                let Some(mut request) = server.recv_timeout(Duration::from_millis(20)).unwrap()
                else {
                    continue;
                };
                let mut input = Vec::new();
                worker_headers.lock().unwrap().push(request.headers().iter().map(|header| (
                    header.field.as_str().to_string().to_lowercase(), header.value.to_string(),
                )).collect());
                request.as_reader().read_to_end(&mut input).unwrap();
                worker_requests.lock().unwrap().push((
                    request.url().to_string(),
                    serde_json::from_slice(&input).unwrap_or(Value::Null),
                ));
                worker_calls.fetch_add(1, AtomicOrdering::SeqCst);
                let mut response = Response::from_string(body.clone()).with_status_code(status);
                for header in &headers {
                    response.add_header(header.clone());
                }
                request.respond(response).unwrap();
            }
        });
        Self {
            url,
            calls,
            stop,
            worker: Some(worker),
            requests,
            auth_headers,
        }
    }

    fn status(status: u16) -> Self {
        Self::new(status, "{}", vec![("Content-Type", "application/json")])
    }

    fn calls(&self) -> usize {
        self.calls.load(AtomicOrdering::SeqCst)
    }
}

impl Drop for AggregateTestServer {
    fn drop(&mut self) {
        self.stop.store(true, AtomicOrdering::SeqCst);
        self.worker.take().unwrap().join().unwrap();
    }
}

fn aggregate_test_target(urls: &[&str]) -> AggregateTarget {
    let profiles = urls
        .iter()
        .enumerate()
        .map(|(index, url)| {
            let mut provider = fallback_test_provider();
            provider.id = format!("member-{index}");
            provider.base_url = (*url).to_string();
            provider.model = "shared-model".into();
            provider.models = vec![provider.model.clone()];
            provider.api_format = ProviderApiFormat::OpenaiResponses;
            provider.model_api_formats =
                [(provider.model.clone(), ProviderApiFormat::OpenaiResponses)].into();
            provider
        })
        .collect::<Vec<_>>();
    AggregateTarget {
        config: AggregateApiConfig {
            member_models: Default::default(),
            id: uuid::Uuid::new_v4().to_string(),
            name: "Failover fixture".into(),
            model: "shared-model".into(),
            member_provider_ids: profiles
                .iter()
                .map(|provider| provider.id.clone())
                .collect(),
            enabled: true,
            failover_policy: Default::default(),
        },
        profiles,
    }
}

fn send_aggregate_fixture(target: &AggregateTarget) -> Result<UpstreamPayload, String> {
    let app = breakdown_responsiveness_test_app();
    forward_aggregate_request(app.handle(), AggregateForwardRequest {
        method: &Method::Post,
        url: "/v1/responses",
        headers: &[],
        body: br#"{"input":"hello","stream":false}"#.to_vec(),
        session_id: Some("conversation"),
        target,
    })
}

#[test]
fn aggregate_attempt_budget_is_not_restarted_by_outer_rate_limit_retries() {
    let first = AggregateTestServer::status(503);
    let second = AggregateTestServer::status(429);
    let third = AggregateTestServer::status(200);
    let mut target = aggregate_test_target(&[&first.url, &second.url, &third.url]);
    target.config.failover_policy.max_attempts = 2;
    let response = retry_upstream_request_for_target(
        true,
        Duration::from_secs(60),
        || send_aggregate_fixture(&target),
        |_, _| panic!("Aggregate failures must keep their own budget"),
    )
    .unwrap();
    assert_eq!(response.status, 429);
    assert_eq!([first.calls(), second.calls(), third.calls()], [1, 1, 0]);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_disabled_policy_keeps_the_session_and_sends_once() {
    let first = AggregateTestServer::status(503);
    let second = AggregateTestServer::status(200);
    let mut target = aggregate_test_target(&[&first.url, &second.url]);
    target.config.failover_policy.enabled = false;
    for _ in 0..2 {
        assert_eq!(send_aggregate_fixture(&target).unwrap().status, 503);
    }
    assert_eq!([first.calls(), second.calls()], [2, 0]);
    let states =
        aggregate_scheduler::member_states(&target.config.id, &target.config.member_provider_ids)
            .unwrap();
    assert_eq!(states["member-0"].consecutive_failures, 0);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_http_failure_codes_are_configurable_without_marking_other_errors_successful() {
    let first = AggregateTestServer::status(401);
    let second = AggregateTestServer::status(200);
    let mut target = aggregate_test_target(&[&first.url, &second.url]);
    assert_eq!(send_aggregate_fixture(&target).unwrap().status, 401);
    assert_eq!(second.calls(), 0);
    target.config.failover_policy.retry_status_codes = vec![401];
    let response = send_aggregate_fixture(&target).unwrap();
    assert_eq!(response.status, 200);
    read_upstream_payload(response);
    assert_eq!([first.calls(), second.calls()], [2, 1]);
    let states =
        aggregate_scheduler::member_states(&target.config.id, &target.config.member_provider_ids)
            .unwrap();
    assert_eq!(states["member-0"].consecutive_failures, 1);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_honors_server_wait_before_threshold_and_above_local_backoff_limit() {
    let first = AggregateTestServer::new(429, "{}", vec![("Retry-After", "600")]);
    let second = AggregateTestServer::status(200);
    let target = aggregate_test_target(&[&first.url, &second.url]);
    read_upstream_payload(send_aggregate_fixture(&target).unwrap());
    let states =
        aggregate_scheduler::member_states(&target.config.id, &target.config.member_provider_ids)
            .unwrap();
    assert_eq!(
        states["member-0"].state,
        aggregate_scheduler::MemberState::CoolingDown
    );
    assert_eq!(states["member-0"].consecutive_failures, 1);
    assert!(states["member-0"].retry_after_seconds >= 599);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_connection_failure_before_upload_can_use_another_member() {
    let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let unavailable = format!("http://{}", socket.local_addr().unwrap());
    drop(socket);
    let second = AggregateTestServer::status(200);
    let target = aggregate_test_target(&[&unavailable, &second.url]);
    let response = send_aggregate_fixture(&target).unwrap();
    assert_eq!(response.status, 200);
    read_upstream_payload(response);
    assert_eq!(second.calls(), 1);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_never_replays_ambiguous_transport_errors_or_matches_error_text() {
    let policy = crate::aggregate_failover::AggregateFailoverPolicy::default();
    let error = Err("Provider proxy request failed: connection timed out".to_string());
    let (outcome, retry) = aggregate_failure_decision(
        &policy,
        &error,
        Some(failover_transport::NetworkFailure { replay_safe: false }),
    );
    assert!(!retry);
    assert!(matches!(
        outcome,
        aggregate_scheduler::MemberOutcome::Failure { .. }
    ));
    let (outcome, retry) = aggregate_failure_decision(&policy, &error, None);
    assert!(!retry);
    assert!(matches!(
        outcome,
        aggregate_scheduler::MemberOutcome::Neutral
    ));
}

#[test]
fn aggregate_does_not_replay_an_earlier_http_error_after_an_ambiguous_protocol_fallback() {
    let mut policy = crate::aggregate_failover::AggregateFailoverPolicy {
        retry_status_codes: vec![400],
        ..Default::default()
    };
    let previous = Ok(UpstreamPayload {
        status: 400,
        content_type: Some("application/json".into()),
        response_headers: vec![],
        body: UpstreamBody::Buffered(b"{}".to_vec()),
        token_usage_account: None,
        token_usage_service_tier: None,
    });
    let network = Some(failover_transport::NetworkFailure { replay_safe: false });
    assert!(!aggregate_failure_decision(&policy, &previous, network).1);
    policy.retry_on_network_errors = false;
    assert!(!aggregate_failure_decision(&policy, &previous, network).1);
}

#[test]
fn aggregate_stream_truncation_marks_failure_without_replaying_output() {
    let output = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n";
    let first = AggregateTestServer::new(200, output, vec![("Content-Type", "text/event-stream")]);
    let second = AggregateTestServer::status(200);
    let mut target = aggregate_test_target(&[&first.url, &second.url]);
    target.config.failover_policy.failure_threshold = 1;
    let payload = send_aggregate_fixture(&target).unwrap();
    assert_eq!(read_upstream_payload(payload), output.as_bytes());
    assert_eq!(second.calls(), 0);
    let states =
        aggregate_scheduler::member_states(&target.config.id, &target.config.member_provider_ids)
            .unwrap();
    assert_eq!(
        states["member-0"].state,
        aggregate_scheduler::MemberState::CoolingDown
    );
    assert_eq!(states["member-0"].consecutive_failures, 1);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_native_messages_follow_the_same_failover_policy() {
    let first = AggregateTestServer::status(503);
    let second = AggregateTestServer::new(
        200,
        r#"{"type":"message","id":"msg","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}"#,
        vec![("Content-Type", "application/json")],
    );
    let mut target = aggregate_test_target(&[&first.url, &second.url]);
    for provider in &mut target.profiles {
        provider.api_format = ProviderApiFormat::AnthropicMessages;
        provider.model_api_formats.clear();
    }
    let app = breakdown_responsiveness_test_app();
    let payload = forward_aggregate_request(app.handle(), AggregateForwardRequest {
        method: &Method::Post,
        url: "/v1/messages",
        headers: &[],
        session_id: Some("native"),
        target: &target,
        body:
            br#"{"model":"client","max_tokens":512,"messages":[{"role":"user","content":"hello"}]}"#
                .to_vec(),
    })
    .unwrap();
    assert_eq!(payload.status, 200);
    let body: Value = serde_json::from_slice(&read_upstream_payload(payload)).unwrap();
    assert_eq!(body["content"][0]["text"], "ok");
    assert_eq!([first.calls(), second.calls()], [1, 1]);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_stream_drop_uses_observed_terminal_events_but_keeps_cancellation_neutral() {
    for (event, failures) in [
        (r#"{"type":"response.completed"}"#, 0),
        (
            r#"{"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}"#,
            0,
        ),
        (
            r#"{"type":"response.incomplete","response":{"incomplete_details":{"reason":"content_filter"}}}"#,
            0,
        ),
        (r#"{"type":"error","error":{"message":"unavailable"}}"#, 2),
        (
            r#"{"type":"response.output_text.delta","delta":"partial"}"#,
            1,
        ),
    ] {
        let target = aggregate_test_target(&["http://localhost"]);
        let select = || {
            aggregate_scheduler::select_member(aggregate_scheduler::SelectionOptions {
                aggregate_id: &target.config.id,
                session_id: None,
                member_ids: &target.config.member_provider_ids,
                excluded: &HashSet::new(),
                policy: &target.config.failover_policy,
            })
            .unwrap()
        };
        select().finish(aggregate_scheduler::MemberOutcome::Failure { retry_after: None });
        let body = format!("data: {event}\n\n").into_bytes();
        let length = body.len();
        let mut payload = watch_aggregate_response(
            UpstreamPayload {
                status: 200,
                content_type: Some("text/event-stream".into()),
                response_headers: vec![],
                body: UpstreamBody::Streaming(Box::new(std::io::Cursor::new(body))),
                token_usage_account: None,
                token_usage_service_tier: None,
            },
            select(),
        );
        let UpstreamBody::Streaming(reader) = &mut payload.body else {
            panic!("expected stream")
        };
        reader.read_exact(&mut vec![0; length]).unwrap();
        drop(payload);
        let states = aggregate_scheduler::member_states(
            &target.config.id,
            &target.config.member_provider_ids,
        )
        .unwrap();
        assert_eq!(states["member-0"].consecutive_failures, failures, "{event}");
        aggregate_scheduler::reset(&target.config.id);
    }
}
