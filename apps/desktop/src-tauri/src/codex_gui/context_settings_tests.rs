use super::*;
use serde_json::json;

#[test]
fn capacities_persist_independently_and_reset_to_default() {
    let root = std::env::temp_dir().join(format!("gui-context-{}", uuid::Uuid::new_v4()));
    save(
        &root,
        "one",
        ContextSettings {
            capacity: Some(128_000),
        },
    )
    .unwrap();
    save(
        &root,
        "two",
        ContextSettings {
            capacity: Some(1_000_000),
        },
    )
    .unwrap();
    assert_eq!(read(&root, "one").unwrap().capacity, Some(128_000));
    assert_eq!(read(&root, "two").unwrap().capacity, Some(1_000_000));
    assert_eq!(read(&root, "new").unwrap().capacity, None);
    save(&root, "one", ContextSettings::default()).unwrap();
    assert_eq!(read(&root, "one").unwrap().capacity, None);
    assert_eq!(read(&root, "two").unwrap().capacity, Some(1_000_000));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn invalid_ids_and_capacities_are_rejected() {
    for id in ["", "../other", "..", "a/b", "a\\b", "C:foo", "\n"] {
        assert!(settings_path(Path::new("unused"), id).is_err());
    }
    for capacity in [0, MIN_CAPACITY - 1, MAX_CAPACITY + 1] {
        assert!(validate(&ContextSettings {
            capacity: Some(capacity)
        })
        .is_err());
    }
    for value in [
        json!({"capacity": -1}),
        json!({"capacity": 1.5}),
        json!({"capacity": "128000"}),
    ] {
        assert!(serde_json::from_value::<ContextSettings>(value).is_err());
    }
}

#[test]
fn resume_overrides_only_capacity_and_default_preserves_model_configuration() {
    let original = json!({"threadId": "one", "config": {"unrelated": true}, "model": "test-model"});
    let mut params = original.clone();
    apply_capacity(&mut params, &ContextSettings::default());
    assert_eq!(params, original);
    apply_capacity(
        &mut params,
        &ContextSettings {
            capacity: Some(256_000),
        },
    );
    assert_eq!(params["config"]["model_context_window"], 256_000);
    assert_eq!(params["config"]["unrelated"], true);
    assert_eq!(params["model"], "test-model");
    let mut fresh = json!({"threadId": "two"});
    apply_capacity(
        &mut fresh,
        &ContextSettings {
            capacity: Some(128_000),
        },
    );
    assert_eq!(fresh["config"]["model_context_window"], 128_000);
}
