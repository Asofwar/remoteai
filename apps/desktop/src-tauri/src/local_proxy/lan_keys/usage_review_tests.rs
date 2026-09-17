use super::*;

#[test]
fn default_and_custom_review_limits_only_block_at_the_boundary() {
    let mut key = legacy_key("review-test-secret");
    key.quota_usd = Some(10.0);
    for threshold in [DEFAULT_LAN_USAGE_REVIEW_THRESHOLD, 2] {
        key.usage_review_threshold = threshold;
        for count in [0, threshold - 1, threshold, threshold + 1] {
            let usage = ledger::KeyUsage {
                unconfirmed_requests: u64::from(count),
                ..Default::default()
            };
            assert_eq!(
                summary(&key, usage).needs_usage_review(),
                count >= threshold
            );
        }
    }
    key.quota_usd = None;
    assert!(!summary(
        &key,
        ledger::KeyUsage {
            unconfirmed_requests: u64::MAX,
            ..Default::default()
        }
    )
    .needs_usage_review());
}

#[test]
fn older_keys_default_to_1000_and_edits_preserve_custom_limits() {
    let key: LocalProxyLanApiKey = serde_json::from_value(json!({
        "id": "old", "name": "Old", "apiKey": "legacy-secret", "enabled": true, "quotaUsd": 10
    }))
    .unwrap();
    assert_eq!(key.usage_review_threshold, 1000);
    let mut state = ManagerStateFile::default();
    save_key(&mut state, input("first", Some(10.0))).unwrap();
    assert_eq!(
        state.local_proxy_lan_api_keys[0].usage_review_threshold,
        1000
    );
    let id = state.local_proxy_lan_api_keys[0].id.clone();
    let mut edit = input("custom", Some(10.0));
    edit.id = Some(id.clone());
    edit.usage_review_threshold = Some(25);
    save_key(&mut state, edit).unwrap();
    let mut toggle = input("disabled", Some(10.0));
    toggle.id = Some(id);
    toggle.enabled = false;
    save_key(&mut state, toggle).unwrap();
    assert_eq!(state.local_proxy_lan_api_keys[0].usage_review_threshold, 25);
    for threshold in [0, MAX_LAN_USAGE_REVIEW_THRESHOLD + 1] {
        let mut invalid = input("invalid", None);
        invalid.usage_review_threshold = Some(threshold);
        assert!(matches!(
            validate_input(&invalid),
            Err(LanKeyError::InvalidUsageReviewThreshold)
        ));
    }
}

#[test]
fn successful_missing_usage_accumulates_and_acknowledgment_keeps_spent_totals() {
    let fixture = Fixture::new();
    ledger::record(
        &fixture.paths,
        &fixture.key_id,
        ledger::KeyUsage {
            tokens: 100,
            cost_usd: 0.5,
            unconfirmed_requests: 998,
        },
    )
    .unwrap();
    for count in [999, 1000] {
        proxy::attach_token_usage_capture(
            fixture.app.handle(),
            Some(fixture.context("/v1/responses")),
            Ok(proxy::json_payload(
                200,
                json!({"status": "completed", "output": []}),
            )),
        )
        .unwrap();
        let keys = list_summaries(&fixture.paths).unwrap();
        assert_eq!(keys[0].unconfirmed_requests, count);
        assert_eq!(keys[0].needs_usage_review(), count == 1000);
    }
    let complete = proxy::json_payload(
        200,
        json!({"usage": {"input_tokens": 20, "output_tokens": 5}}),
    );
    proxy::attach_token_usage_capture(
        fixture.app.handle(),
        Some(fixture.context("/v1/responses")),
        Ok(complete),
    )
    .unwrap();
    let before = fixture.usage();
    assert_eq!(before.unconfirmed_requests, 1000);
    let mut edit = input("reviewed", Some(10.0));
    edit.id = Some(fixture.key_id.clone());
    edit.acknowledge_usage = true;
    let keys = tauri::async_runtime::block_on(save_local_proxy_lan_api_key(
        fixture.app.handle().clone(),
        edit,
    ))
    .unwrap();
    assert!(!keys[0].needs_usage_review());
    assert_eq!(keys[0].unconfirmed_requests, 0);
    assert_eq!(keys[0].used_tokens, before.tokens);
    assert_eq!(keys[0].used_cost_usd, before.cost_usd);
}
