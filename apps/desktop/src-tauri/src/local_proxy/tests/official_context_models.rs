use super::*;
use crate::local_proxy::{override_official_model_context_windows, UpstreamBody, UpstreamPayload};
use serde_json::json;

const MODEL: &str = "gpt-6.1-sol";

fn overrides() -> ContextWindows {
    BTreeMap::from([("gpt-6-sol".into(), 272_000), (MODEL.into(), 500_000)])
}

fn old_catalog() -> Value {
    json!({"models": [{"slug": "gpt-6-sol", "context_window": 272_000}]})
}

fn supplemental_catalog() -> Value {
    json!({"models": [{
        "slug": MODEL,
        "visibility": "list",
        "context_window": 373_000,
        "max_context_window": 872_000,
        "auto_compact_token_limit": 250_000,
        "effective_context_window_percent": 95,
        "base_instructions": "model-specific instructions",
        "model_messages": {"instructions_template": "model-specific template"},
        "tool_mode": "code_mode_only",
        "use_responses_lite": true,
        "supported_reasoning_levels": [{"effort": "high", "description": "High"}]
    }, {"slug": "unconfigured-model"}]})
}

#[test]
fn missing_configured_model_is_completed_without_replacing_existing_metadata() {
    let mut catalog = old_catalog();
    let original = catalog["models"][0].clone();
    let mut source = supplemental_catalog();
    source["models"].as_array_mut().unwrap().push(json!({
        "slug": "gpt-6-sol", "base_instructions": "must not replace existing model"
    }));

    assert!(append_configured_models(
        &mut catalog,
        &overrides(),
        &source
    ));
    assert_eq!(catalog["models"].as_array().unwrap().len(), 2);
    assert_eq!(catalog["models"][0], original);
    let mut hidden = source["models"][0].clone();
    hidden["visibility"] = "hide".into();
    assert_eq!(catalog["models"][1], hidden);
    assert!(!append_configured_models(
        &mut catalog,
        &overrides(),
        &source
    ));
}

#[test]
fn complete_catalogs_and_global_only_settings_do_not_fetch_supplemental_models() {
    let mut catalog = old_catalog();
    complete_from(&mut catalog, &BTreeMap::new(), || panic!("unneeded fetch"));
    append_configured_models(&mut catalog, &overrides(), &supplemental_catalog());
    assert!(!complete_from(&mut catalog, &overrides(), || panic!(
        "unneeded fetch"
    )));
}

#[test]
fn unavailable_or_unknown_models_preserve_the_usable_catalog() {
    let original = old_catalog();
    let mut catalog = original.clone();
    assert!(!complete_from(&mut catalog, &overrides(), || Err(
        "offline".into()
    )));
    assert_eq!(catalog, original);
    assert!(!complete_from(&mut catalog, &overrides(), || Ok(
        json!({"models": []})
    )));
    assert_eq!(catalog, original);
}

#[test]
fn exact_names_and_id_entries_are_supported_without_creating_unknown_models() {
    let mut catalog = json!({"models": [null, {"id": "existing"}]});
    let overrides = BTreeMap::from([
        ("existing".into(), 500_000),
        (MODEL.into(), 500_000),
        ("zero".into(), 0),
        ("unknown".into(), 500_000),
    ]);
    let source = json!({"models": [null, {"id": "existing"}, {"id": MODEL},
        {"slug": "GPT-6.1-SOL"}, {"slug": "gpt-6.1-sol-extra"}, {"slug": "zero"}]});
    assert!(append_configured_models(&mut catalog, &overrides, &source));
    assert_eq!(
        catalog,
        json!({"models": [null, {"id": "existing"}, {"id": MODEL, "visibility": "hide"}]})
    );
}

#[test]
fn proxy_payload_applies_missing_model_capacity_and_updates_cache_identity() {
    let payload = UpstreamPayload {
        status: 200,
        content_type: Some("application/json".into()),
        response_headers: vec![("etag".into(), "old-catalog".into())],
        body: UpstreamBody::Buffered(serde_json::to_vec(&old_catalog()).unwrap()),
        token_usage_service_tier: None,
        token_usage_account: None,
    };
    let source = supplemental_catalog();
    let payload =
        override_official_model_context_windows(payload, 500_000, &overrides(), |catalog| {
            append_configured_models(catalog, &overrides(), &source)
        })
        .unwrap();
    let UpstreamBody::Buffered(bytes) = payload.body else {
        panic!("expected buffered catalog")
    };
    let catalog: Value = serde_json::from_slice(&bytes).unwrap();
    let mut expected = source["models"][0].clone();
    expected["context_window"] = json!(500_000);
    expected["max_context_window"] = json!(500_000);
    expected["auto_compact_token_limit"] = Value::Null;
    expected["visibility"] = "hide".into();
    assert_eq!(catalog["models"][1], expected);
    assert_eq!(catalog["models"][0]["context_window"], 272_000);
    assert_eq!(
        crate::local_proxy::model_context_windows_from_catalog(&catalog)[MODEL],
        475_000
    );
    assert_ne!(payload.response_headers[0].1, "old-catalog");
}

#[test]
fn supplementation_preserves_each_accounts_visible_models() {
    let source = supplemental_catalog();
    for visible in [vec!["gpt-6-sol"], vec!["gpt-6-sol", MODEL]] {
        let mut catalog = json!({"models": visible.iter().map(|name| {
            json!({"slug": name, "visibility": "list"})
        }).collect::<Vec<_>>()});
        append_configured_models(&mut catalog, &overrides(), &source);
        let listed: Vec<_> = catalog["models"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|model| model["visibility"] == "list")
            .map(|model| model["slug"].as_str().unwrap())
            .collect();
        assert_eq!(listed, visible);
    }
}

#[test]
#[ignore = "Set CODEX_CONTEXT_TEST_CLI to an installed Codex binary; requires Node and local HTTP only"]
fn real_cli_uses_completed_model_context_and_compaction_limit() {
    let executable = std::env::var_os("CODEX_CONTEXT_TEST_CLI").expect("Codex binary is required");
    let original = old_catalog();
    let mut updated = original.clone();
    append_configured_models(&mut updated, &overrides(), &supplemental_catalog());
    crate::local_proxy::apply_official_context_windows(&mut updated, 500_000, &overrides());
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../scripts/official-context-compaction-smoke.mjs");
    let output = std::process::Command::new("node")
        .arg(script)
        .arg(executable)
        .arg(json!({"original": original, "updated": updated}).to_string())
        .output()
        .expect("run the official context fixture");
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    println!("{}", String::from_utf8_lossy(&output.stdout));
}
