#[test]
fn provider_request_options_retain_old_client_updates_and_allow_explicit_clear() {
    let mut saved = provider();
    saved.request_options = Some(
        serde_json::from_value(json!({
            "headers": {"X-Region": "east"}, "body": {"temperature": 0.4}
        }))
        .unwrap(),
    );
    assert_eq!(
        retained_request_options(Some(&saved), &saved.base_url, None),
        saved.request_options
    );
    assert_eq!(
        retained_request_options(Some(&saved), "https://other.example/v1", None),
        Some(crate::models::ProviderRequestOptions::default())
    );
    let cleared = crate::models::ProviderRequestOptions::default();
    assert_eq!(
        retained_request_options(Some(&saved), &saved.base_url, Some(cleared.clone())),
        Some(cleared)
    );
}

#[test]
fn provider_request_options_preserve_exact_full_endpoint_during_normalization_and_storage() {
    let mut profile = provider();
    profile.base_url = "https://gateway.example/custom/?route=west/".to_string();
    profile.request_options = Some(
        serde_json::from_value(json!({
            "useFullUrl": true, "headers": {"X-Region": "east"}, "body": {"temperature": 0.4}
        }))
        .unwrap(),
    );
    let normalized = normalize_synced_provider(profile.clone()).unwrap();
    assert_eq!(normalized.base_url, profile.base_url);
    assert_eq!(
        retained_request_options(Some(&profile), &profile.base_url, None),
        profile.request_options
    );
    let serialized = serde_json::to_value(&normalized).unwrap();
    let restored: ProviderProfile = serde_json::from_value(serialized).unwrap();
    assert_eq!(restored.request_options, profile.request_options);
    assert_eq!(restored.base_url, profile.base_url);
    let versions = provider_field_values(&restored);
    assert!(versions.contains(&json!(profile.request_options)));
}
