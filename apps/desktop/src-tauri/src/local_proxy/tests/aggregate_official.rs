thread_local! {
    static AGGREGATE_OFFICIAL_UPSTREAM: std::cell::RefCell<Option<String>> = const {
        std::cell::RefCell::new(None)
    };
}

pub(super) fn aggregate_official_test_upstream() -> Option<String> {
    AGGREGATE_OFFICIAL_UPSTREAM.with(|value| value.borrow().clone())
}

struct AggregateOfficialUpstream;

impl AggregateOfficialUpstream {
    fn set(url: &str) -> Self {
        AGGREGATE_OFFICIAL_UPSTREAM.with(|value| value.replace(Some(url.into())));
        Self
    }
}

impl Drop for AggregateOfficialUpstream {
    fn drop(&mut self) {
        AGGREGATE_OFFICIAL_UPSTREAM.with(|value| value.replace(None));
    }
}

fn aggregate_official_account(paths: &Paths, email: &str) -> String {
    let auth = json!({"tokens": {
        "access_token":format!("test-token-{email}"), "email":email, "account_id":"test-workspace"
    }});
    let (_, _, _, id) = account_fields(&auth).unwrap();
    crate::storage::write_json_atomic(&managed_auth_path(paths, &id), &auth).unwrap();
    format!("{}{id}", aggregate_api::ACCOUNT_MEMBER_PREFIX)
}

fn aggregate_official_target(paths: &Paths, server: &AggregateTestServer) -> AggregateTarget {
    let mut target = aggregate_test_target(&[&server.url, &server.url]);
    let account = aggregate_official_account(paths, "selected@example.test");
    crate::storage::write_json_atomic(
        &paths.providers.join("member-0.json"),
        &serde_json::to_value(&target.profiles[0]).unwrap(),
    )
    .unwrap();
    target.config.member_provider_ids[1] = account.clone();
    target
        .config
        .member_models
        .insert(account, "official-model".into());
    target.config.failover_policy.routing_strategy =
        crate::aggregate_failover::AggregateRoutingStrategy::Priority;
    target.config.failover_policy.failure_threshold = 1;
    target.profiles = aggregate_api::member_profiles(paths, &target.config).unwrap();
    target
}

fn send_official_aggregate_fixture<R: Runtime>(
    app: &tauri::AppHandle<R>,
    target: &AggregateTarget,
    session: &str,
) -> UpstreamPayload {
    forward_aggregate_request(
        app,
        AggregateForwardRequest {
            method: &Method::Post,
            url: "/v1/responses",
            headers: &[],
            body: br#"{"model":"logical-model","input":"hello","stream":false}"#.to_vec(),
            session_id: Some(session),
            target,
        },
    )
    .unwrap()
}

#[test]
fn aggregate_mixed_failover_uses_selected_official_credentials_and_keeps_shared_state() {
    let app = breakdown_responsiveness_test_app();
    let paths = resolve_paths(app.handle()).unwrap();
    let provider = AggregateTestServer::status(503);
    let official = AggregateTestServer::status(200);
    let _upstream = AggregateOfficialUpstream::set(&official.url);
    let target = aggregate_official_target(&paths, &provider);
    let shared = ManagerStateFile {
        active_account_id: Some("unrelated-account".into()),
        concurrent_account_routing_enabled: true,
        ..Default::default()
    };
    write_state(&paths, &shared).unwrap();
    let response = send_official_aggregate_fixture(app.handle(), &target, "official-failover");
    assert_eq!(response.status, 200);
    let account = response.token_usage_account.as_ref().unwrap();
    assert_eq!(account.account_email, "selected@example.test");
    assert!(!account.auto_switch_eligible);
    assert!(account.concurrent_request_started_at.is_none());
    read_upstream_payload(response);
    let headers = official.auth_headers.lock().unwrap();
    assert_eq!(
        headers[0]["authorization"],
        "Bearer test-token-selected@example.test"
    );
    assert_eq!(headers[0]["chatgpt-account-id"], "test-workspace");
    drop(headers);
    let requests = official.requests.lock().unwrap();
    assert_eq!(requests[0].0, "/responses");
    assert_eq!(requests[0].1["model"], "official-model");
    drop(requests);
    read_upstream_payload(send_official_aggregate_fixture(
        app.handle(),
        &target,
        "official-failover",
    ));
    assert_eq!([provider.calls(), official.calls()], [1, 2]);
    assert_eq!(
        read_state(&paths).active_account_id,
        shared.active_account_id
    );
    assert!(read_state(&paths).concurrent_account_routing_enabled);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_official_quota_failure_uses_api_backup_and_updates_health() {
    let app = breakdown_responsiveness_test_app();
    let paths = resolve_paths(app.handle()).unwrap();
    let provider = AggregateTestServer::status(200);
    let official = AggregateTestServer::status(429);
    let _upstream = AggregateOfficialUpstream::set(&official.url);
    let mut target = aggregate_official_target(&paths, &provider);
    target.config.member_provider_ids.reverse();
    target.profiles.reverse();
    let response = send_official_aggregate_fixture(app.handle(), &target, "quota-backup");
    assert_eq!(response.status, 200);
    assert!(response.token_usage_account.is_none());
    read_upstream_payload(response);
    assert_eq!([official.calls(), provider.calls()], [1, 1]);
    let states =
        aggregate_scheduler::member_states(&target.config.id, &target.config.member_provider_ids)
            .unwrap();
    assert_eq!(
        states[&target.config.member_provider_ids[0]].state,
        aggregate_scheduler::MemberState::CoolingDown
    );
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_two_official_accounts_balance_conversations_without_an_active_account() {
    let app = breakdown_responsiveness_test_app();
    let paths = resolve_paths(app.handle()).unwrap();
    let official = AggregateTestServer::status(200);
    let _upstream = AggregateOfficialUpstream::set(&official.url);
    let mut target = aggregate_official_target(&paths, &official);
    let second = aggregate_official_account(&paths, "second@example.test");
    target.config.member_provider_ids[0] = second.clone();
    target
        .config
        .member_models
        .insert(second, "second-model".into());
    target.config.failover_policy.routing_strategy =
        crate::aggregate_failover::AggregateRoutingStrategy::Balanced;
    target.profiles = aggregate_api::member_profiles(&paths, &target.config).unwrap();
    let mut emails = Vec::new();
    for session in ["first-conversation", "second-conversation"] {
        let response = send_official_aggregate_fixture(app.handle(), &target, session);
        emails.push(
            response
                .token_usage_account
                .as_ref()
                .unwrap()
                .account_email
                .clone(),
        );
        read_upstream_payload(response);
    }
    emails.sort();
    assert_eq!(emails, ["second@example.test", "selected@example.test"]);
    let models = official
        .requests
        .lock()
        .unwrap()
        .iter()
        .map(|(_, body)| body["model"].as_str().unwrap().to_string())
        .collect::<HashSet<_>>();
    assert_eq!(
        models,
        HashSet::from(["official-model".to_string(), "second-model".to_string()])
    );
    assert!(read_state(&paths).active_account_id.is_none());
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn aggregate_anthropic_requests_use_the_official_member_model_and_account() {
    let app = breakdown_responsiveness_test_app();
    let paths = resolve_paths(app.handle()).unwrap();
    let official = AggregateTestServer::new(
        200,
        r#"{"id":"response","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"ok"}]}]}"#,
        vec![("Content-Type", "application/json")],
    );
    let _upstream = AggregateOfficialUpstream::set(&official.url);
    let mut target = aggregate_official_target(&paths, &official);
    target.config.member_provider_ids.reverse();
    target.profiles.reverse();
    let response = forward_aggregate_request(app.handle(), AggregateForwardRequest {
        method: &Method::Post, url: "/v1/messages", headers: &[],
        body: br#"{"model":"claude","max_tokens":512,"messages":[{"role":"user","content":"hello"}]}"#.to_vec(),
        session_id: Some("anthropic-official"), target: &target,
    }).unwrap();
    assert_eq!(response.status, 200);
    assert_eq!(
        response.token_usage_account.as_ref().unwrap().account_email,
        "selected@example.test"
    );
    let body: Value = serde_json::from_slice(&read_upstream_payload(response)).unwrap();
    assert_eq!(body["content"][0]["text"], "ok");
    assert_eq!(
        official.requests.lock().unwrap()[0].1["model"],
        "official-model"
    );
    aggregate_scheduler::reset(&target.config.id);
}
