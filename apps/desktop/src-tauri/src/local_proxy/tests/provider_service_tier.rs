#[test]
fn providers_without_fast_support_never_send_service_tier() {
    for kind in [ProviderKind::OpenAi, ProviderKind::Custom] {
        for tier in [None, Some("default"), Some("priority"), Some("fast")] {
            assert_provider_omits_service_tier(kind, tier);
        }
    }
}

fn assert_provider_omits_service_tier(kind: ProviderKind, tier: Option<&str>) {
    for (format, path) in [
        (ProviderApiFormat::OpenaiResponses, "/v1/responses"),
        (ProviderApiFormat::OpenaiChat, "/v1/responses"),
        (ProviderApiFormat::OpenaiChat, "/v1/chat/completions"),
    ] {
        let (base_url, handle) = service_tier_local_upstream(format, false);
        let mut provider = openai_provider(base_url);
        provider.kind = kind;
        provider.fast_mode_enabled = false;
        provider.api_format = format;
        let mut request = json!({
            "model": SERVICE_TIER_TEST_MODEL, "input": "ping",
            "messages": [{"role": "user", "content": "ping"}]
        });
        if let Some(tier) = tier {
            request["service_tier"] = json!(tier);
        }
        let payload = forward_provider_request(
            &Method::Post,
            path,
            &[],
            serde_json::to_vec(&request).unwrap(),
            &provider,
        )
        .unwrap();
        let (_, sent) = handle.join().unwrap();
        assert!(
            sent.get("service_tier").is_none(),
            "{kind:?} {format:?} {tier:?}: {sent}"
        );
        assert_eq!(payload.status, 200);
    }
}

#[test]
fn disabled_fast_mode_removes_empty_and_repeated_multipart_tiers() {
    let mut provider = openai_provider("http://localhost/v1".to_string());
    provider.fast_mode_enabled = false;
    let headers = service_tier_multipart_headers();
    let original = service_tier_multipart(None);
    for tier in ["", "default", "priority", "fast"] {
        let body = service_tier_multipart(Some(tier));
        assert_eq!(
            enforce_provider_service_tier(body, &headers, &provider),
            original
        );
    }
    let repeated = String::from_utf8(service_tier_multipart(Some("priority"))).unwrap().replace(
        "--tier-test--\r\n",
        concat!(
            "--tier-test\r\nContent-Disposition: form-data; name=\"service_tier\"\r\n\r\ndefault\r\n",
            "--tier-test--\r\n"
        ),
    ).into_bytes();
    assert_eq!(
        enforce_provider_service_tier(repeated.clone(), &headers, &provider),
        original
    );
    provider.fast_mode_enabled = true;
    assert_eq!(
        enforce_provider_service_tier(repeated.clone(), &headers, &provider),
        repeated
    );
}
