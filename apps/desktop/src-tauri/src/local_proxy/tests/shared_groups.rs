const SHARED_GROUP_OFFICIAL_RESPONSE: &str = concat!(
    r#"{"id":"response","status":"completed","output":[{"type":"message","content":["#,
    r#"{"type":"output_text","text":"ok"}]}]}"#,
);

#[test]
fn shared_group_routes_official_and_api_models_with_isolated_credentials() {
    let app = breakdown_responsiveness_test_app();
    let paths = resolve_paths(app.handle()).unwrap();
    let api = AggregateTestServer::status(200);
    let official = AggregateTestServer::new(200, SHARED_GROUP_OFFICIAL_RESPONSE,
        vec![("Content-Type", "application/json")]);
    let _upstream = AggregateOfficialUpstream::set(&official.url);
    let mut provider = aggregate_test_target(&[&api.url]).profiles.remove(0);
    provider.group = "Shared".into();
    crate::storage::write_json_atomic(&paths.providers.join("member-0.json"),
        &serde_json::to_value(&provider).unwrap()).unwrap();
    let member = aggregate_official_account(&paths, "group@example.test");
    let id = aggregate_api::member_account_id(&member).unwrap();
    crate::storage::save_account_group(&account_group_path(&paths, id), "Shared").unwrap();
    write_state(&paths, &ManagerStateFile {
        active_provider_group: Some("Shared".into()),
        active_account_id: Some("outside-account".into()), ..Default::default()
    }).unwrap();
    let members = providers::provider_group_profiles(&paths, "Shared").unwrap();
    let account = members.iter().find(|profile| profile.id == member).unwrap();
    let alias = providers::provider_group_model_name(account, &account.models[0]);
    for path in ["/v1/responses", "/v1/messages"] {
        let body = serde_json::to_vec(&json!({"model":alias,"input":"hello", "max_tokens":512,
            "messages":[{"role":"user","content":"hello"}], "stream":false})).unwrap();
        let target = active_target_for_request(app.handle(), path, &body).unwrap();
        assert_eq!(token_usage_target(&target, Some(&json!({"model":alias}))).unwrap().2, account.models[0]);
        let payload = forward_active_request(ActiveForwardRequest {
            app: app.handle(), method: &Method::Post, url: path, headers: &[], body,
            target: &target, session_id: Some("shared-group"), account_id_override: None,
        }).unwrap();
        assert_eq!(payload.status, 200);
        assert_eq!(payload.token_usage_account.as_ref().unwrap().account_email, "group@example.test");
        read_upstream_payload(payload);
    }
    assert!(official.requests.lock().unwrap().iter().all(|(_, body)| body["model"] == account.models[0]));
    assert!(official.auth_headers.lock().unwrap().iter().all(|headers|
        headers["authorization"] == "Bearer test-token-group@example.test"));
    let body = serde_json::to_vec(&json!({"model": providers::provider_group_model_name(&provider, &provider.model),
        "input":"hello", "stream":false})).unwrap();
    let target = active_target_for_request(app.handle(), "/responses", &body).unwrap();
    read_upstream_payload(forward_active_request(ActiveForwardRequest {
        app: app.handle(), method: &Method::Post, url: "/responses", headers: &[], body,
        target: &target, session_id: None, account_id_override: None,
    }).unwrap());
    assert_eq!(api.requests.lock().unwrap()[0].1["model"], provider.model);
    assert_eq!(read_state(&paths).active_account_id.as_deref(), Some("outside-account"));
    assert_eq!(read_state(&paths).active_provider_group.as_deref(), Some("Shared"));
}
