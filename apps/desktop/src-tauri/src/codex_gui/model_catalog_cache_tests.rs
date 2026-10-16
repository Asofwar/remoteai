use super::*;
use serde_json::Value;

#[test]
fn missing_cache_is_empty_and_does_not_create_files() {
    let home = tempfile::tempdir().unwrap();
    let response = read(home.path(), None).unwrap();
    assert_eq!(response.data, json!({"data": [], "nextCursor": null}));
    assert_eq!(fs::read_dir(home.path()).unwrap().count(), 0);
}

#[test]
fn restores_visible_models_and_reasoning_without_changing_the_cache() {
    let home = tempfile::tempdir().unwrap();
    let file = home.path().join("models_cache.json");
    let bytes = serde_json::to_vec(&json!({"models": [
        {"slug": "hidden", "visibility": "hide"},
        {"slug": "saved", "display_name": "Saved model", "default_reasoning_level": "high",
         "supported_reasoning_levels": [{"effort": "high", "description": "Detailed"}]},
        {"slug": "saved"}, {"slug": "other"}
    ]}))
    .unwrap();
    fs::write(&file, &bytes).unwrap();
    let response = read(home.path(), None).unwrap();
    let models = response.data["data"].as_array().unwrap();
    assert_eq!(models.len(), 2);
    assert_eq!(
        models[0],
        json!({"id": "saved", "model": "saved", "displayName": "Saved model",
        "isDefault": true, "defaultReasoningEffort": "high",
        "supportedReasoningEfforts": [{"reasoningEffort": "high", "description": "Detailed"}]})
    );
    assert_eq!(models[1]["displayName"], "other");
    assert_eq!(models[1]["isDefault"], false);
    assert_eq!(response.data["nextCursor"], Value::Null);
    assert_eq!(fs::read(&file).unwrap(), bytes);
}

#[test]
fn corrupt_cache_fails_without_overwriting_it() {
    let home = tempfile::tempdir().unwrap();
    let file = home.path().join("models_cache.json");
    fs::write(&file, b"invalid").unwrap();
    assert!(matches!(
        read(home.path(), None),
        Err(GuiError::ModelCatalog)
    ));
    assert_eq!(fs::read(file).unwrap(), b"invalid");
}

#[test]
fn cached_requests_cannot_fall_through_to_a_cli_model_list() {
    let request: super::super::protocol::GuiRequest = serde_json::from_value(json!({
        "operation": "models", "cacheOnly": true
    }))
    .unwrap();
    assert!(matches!(request.into_rpc(), Err(GuiError::InvalidRequest)));
    let request: super::super::protocol::GuiRequest = serde_json::from_value(json!({
        "operation": "models"
    }))
    .unwrap();
    assert_eq!(request.into_rpc().unwrap().0, "model/list");
}

#[test]
fn explicit_refresh_expires_only_the_cli_timestamp() {
    let home = tempfile::tempdir().unwrap();
    let file = home.path().join("models_cache.json");
    let mut catalog = json!({"fetched_at": "2026-10-16T00:00:00Z", "etag": "saved", "models": [{"slug": "saved"}]});
    fs::write(&file, serde_json::to_vec(&catalog).unwrap()).unwrap();
    expire(home.path()).unwrap();
    catalog["fetched_at"] = json!("2000-01-01T00:00:00Z");
    assert_eq!(
        serde_json::from_slice::<Value>(&fs::read(file).unwrap()).unwrap(),
        catalog
    );
}

#[test]
fn respects_explicit_gui_catalog_and_orders_models_by_priority() {
    let home = tempfile::tempdir().unwrap();
    fs::write(
        home.path().join("config.toml"),
        "model_catalog_json = 'custom.json'",
    )
    .unwrap();
    let catalog = json!({"models": [
        {"slug": "second", "priority": 2}, {"slug": "first", "priority": 1, "default_reasoning_level": null}
    ]});
    fs::write(
        home.path().join("custom.json"),
        serde_json::to_vec(&catalog).unwrap(),
    )
    .unwrap();
    let result = read(home.path(), None).unwrap().data;
    assert_eq!(result["data"][0]["model"], "first");
    assert_eq!(result["data"][0]["defaultReasoningEffort"], "medium");
    assert_eq!(result["data"][0]["isDefault"], true);
    assert!(!home.path().join("models_cache.json").exists());
}
