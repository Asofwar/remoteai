#[test]
fn gui_aggregate_routes_member_aliases_and_protocols_without_resetting_attempt_budget() {
    use crate::codex_gui::account_selection::{self, GuiAccountSelection};
    let app = breakdown_responsiveness_test_app();
    app.manage(crate::codex_gui::web::WebEventState::default());
    let paths = resolve_paths(app.handle()).unwrap();
    let first = AggregateTestServer::status(503);
    let second = AggregateTestServer::status(429);
    let third = AggregateTestServer::status(200);
    let mut target = aggregate_test_target(&[&first.url, &second.url, &third.url]);
    target.config.failover_policy.max_attempts = 2;
    target.config.failover_policy.routing_strategy =
        crate::aggregate_failover::AggregateRoutingStrategy::Priority;
    for (index, provider) in target.profiles.iter_mut().enumerate() {
        let alias = format!("deployment-{index}");
        provider.model = alias.clone();
        provider.models = vec![alias.clone()];
        provider.model_api_formats = [(
            alias.clone(),
            if index == 0 {
                ProviderApiFormat::OpenaiChat
            } else {
                ProviderApiFormat::OpenaiResponses
            },
        )]
        .into();
        target
            .config
            .member_models
            .insert(provider.id.clone(), alias);
        crate::storage::write_json_atomic(
            &paths.providers.join(format!("{}.json", provider.id)),
            &serde_json::to_value(provider).unwrap(),
        )
        .unwrap();
    }
    crate::aggregate_api::write_configs(&paths, &[target.config.clone()]).unwrap();
    let mut settings = read_app_settings(app.handle()).unwrap();
    settings.upstream_429_retry_timeout_seconds = 1;
    crate::storage::write_app_settings(app.handle(), &settings).unwrap();
    let shared = ManagerStateFile {
        active_provider_id: Some("shared-provider".into()),
        ..Default::default()
    };
    write_state(&paths, &shared).unwrap();
    let selection = GuiAccountSelection::Aggregate(target.config.id.clone());
    assert_eq!(
        account_selection::switch_account(app.handle(), selection.clone()).unwrap(),
        selection
    );
    let payload = handle_proxy_request(
        app.handle(),
        &Method::Post,
        "/codex-gui/v1/responses",
        &[],
        br#"{"model":"shared-model","input":"hello","stream":false}"#.to_vec(),
        None,
        None,
    )
    .unwrap();
    assert_eq!(payload.status, 429);
    assert_eq!([first.calls(), second.calls(), third.calls()], [1, 1, 0]);
    let first_requests = first.requests.lock().unwrap();
    assert!(first_requests[0].0.ends_with("/chat/completions"));
    assert_eq!(first_requests[0].1["model"], "deployment-0");
    let second_requests = second.requests.lock().unwrap();
    assert!(second_requests[0].0.ends_with("/responses"));
    assert_eq!(second_requests[0].1["model"], "deployment-1");
    assert_eq!(
        read_state(&paths).active_provider_id,
        shared.active_provider_id
    );
    assert_eq!(account_selection::read(app.handle()).unwrap(), selection);
    aggregate_scheduler::reset(&target.config.id);
}

#[test]
fn gui_aggregate_refresh_invalidates_cached_models_and_clears_disabled_selections() {
    use crate::codex_gui::account_selection::{self, GuiAccountSelection};
    let app = breakdown_responsiveness_test_app();
    app.manage(crate::codex_gui::web::WebEventState::default());
    let paths = resolve_paths(app.handle()).unwrap();
    let mut target = aggregate_test_target(&["https://one.example/v1", "https://two.example/v1"]);
    for provider in &target.profiles {
        crate::storage::write_json_atomic(
            &paths.providers.join(format!("{}.json", provider.id)),
            &serde_json::to_value(provider).unwrap(),
        )
        .unwrap();
    }
    crate::aggregate_api::write_configs(&paths, &[target.config.clone()]).unwrap();
    account_selection::switch_account(
        app.handle(),
        GuiAccountSelection::Aggregate(target.config.id.clone()),
    )
    .unwrap();
    let previous = account_selection::snapshot(app.handle()).unwrap();
    account_selection::refresh_aggregate_selection(app.handle()).unwrap();
    let refreshed = account_selection::snapshot(app.handle()).unwrap();
    assert_eq!(refreshed.selection, previous.selection);
    assert!(refreshed.revision > previous.revision);
    target.config.enabled = false;
    crate::aggregate_api::write_configs(&paths, &[target.config]).unwrap();
    account_selection::refresh_aggregate_selection(app.handle()).unwrap();
    assert_eq!(
        account_selection::read(app.handle()).unwrap(),
        GuiAccountSelection::None
    );
}

#[test]
fn aggregate_catalog_etag_changes_with_member_capabilities() {
    let mut target = aggregate_test_target(&["https://one.example/v1", "https://two.example/v1"]);
    let previous = aggregate_models_etag(&target, false).unwrap();
    for profile in &mut target.profiles {
        profile
            .model_context_windows
            .insert(target.config.model.clone(), 64000);
    }
    assert_ne!(aggregate_models_etag(&target, false).unwrap(), previous);
}
