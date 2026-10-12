use super::*;
use serde_json::json;

#[test]
fn admin_refresh_preserves_custom_values_and_reset_uses_latest_default() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join(FILE_NAME);
    let mut settings = read(&path).unwrap();
    settings.defaults = catalog_capacities(&json!({"models": [
        {"slug": "small", "context_window": 128_000},
        {"slug": "large", "context_window": 400_000}
    ]}));
    update_model(&mut settings, "small".into(), Some(1_000_000)).unwrap();
    write(&path, &settings).unwrap();
    let mut saved = read(&path).unwrap();
    assert_eq!(model_capacity(&saved, "small", true), Some(1_000_000));
    assert_eq!(model_capacity(&saved, "large", true), Some(400_000));
    saved.defaults = catalog_capacities(&json!({"models": [
        {"slug": "small", "context_window": 256_000}
    ]}));
    assert_eq!(model_capacity(&saved, "small", true), Some(1_000_000));
    update_model(&mut saved, "small".into(), None).unwrap();
    assert_eq!(model_capacity(&saved, "small", true), Some(256_000));
    assert_eq!(model_capacity(&saved, "unknown", true), None);
}

#[test]
fn provider_defaults_remain_separate_but_explicit_gui_model_settings_apply() {
    let settings = ModelContextSettings {
        defaults: BTreeMap::from([("same-name".into(), 128_000)]),
        overrides: BTreeMap::from([("custom".into(), 400_000)]),
    };
    assert_eq!(model_capacity(&settings, "same-name", false), None);
    assert_eq!(model_capacity(&settings, "custom", false), Some(400_000));
    let mut catalog = json!({"models": [
        {"slug": "custom", "context_window": 128_000, "effective_context_window_percent": 95},
        {"slug": "same-name", "context_window": 500_000}
    ]});
    apply_catalog(&mut catalog, &settings.overrides);
    assert_eq!(catalog["models"][0]["context_window"], 400_000);
    assert_eq!(catalog["models"][0]["effective_context_window_percent"], 95);
    assert_eq!(catalog["models"][1]["context_window"], 500_000);
}

#[test]
fn invalid_capacities_are_not_loaded_and_corrupt_settings_are_not_overwritten() {
    for capacity in [0, MIN_CAPACITY - 1, MAX_CAPACITY + 1] {
        assert!(validate_capacity(capacity).is_err());
    }
    let defaults = catalog_capacities(&json!({"models": [
        {"slug": "zero", "context_window": 0},
        {"slug": "negative", "context_window": -1},
        {"slug": "float", "context_window": 1.5},
        {"slug": "fallback", "max_context_window": 400_000},
        {"slug": "preferred", "context_window": 128_000, "max_context_window": 400_000}
    ]}));
    assert_eq!(
        defaults,
        BTreeMap::from([("fallback".into(), 400_000), ("preferred".into(), 128_000)])
    );
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join(FILE_NAME);
    fs::write(&path, b"invalid").unwrap();
    assert!(read(&path).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"invalid");
}
