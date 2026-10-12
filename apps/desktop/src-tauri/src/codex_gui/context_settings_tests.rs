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
fn resume_overrides_context_limits_and_default_preserves_model_configuration() {
    let original = json!({"threadId": "one", "config": {
        "unrelated": true, "model_auto_compact_token_limit": 100_000}, "model": "test-model"});
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
    assert_eq!(params["config"]["model_auto_compact_token_limit"], 230_400);
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
    assert_eq!(fresh["config"]["model_auto_compact_token_limit"], 115_200);
}

#[test]
fn changing_capacity_replaces_stale_compaction_limits_in_both_directions() {
    let mut params = json!({"config": {"model_auto_compact_token_limit": 250_000}});
    for (capacity, limit) in [
        (1_000_000, 900_000),
        (400_000, 360_000),
        (1_001, 900),
        (MAX_CAPACITY, 90_000_000),
    ] {
        apply_capacity(
            &mut params,
            &ContextSettings {
                capacity: Some(capacity),
            },
        );
        assert_eq!(params["config"]["model_context_window"], capacity);
        assert_eq!(params["config"]["model_auto_compact_token_limit"], limit);
    }
}

#[test]
fn default_resume_explicitly_resets_a_previous_runtime_override() {
    let mut params = json!({"threadId": "one"});
    apply_capacity(&mut params, &ContextSettings::default());
    assert_eq!(params["config"], json!({}));
}

#[test]
#[ignore = "Set CODEX_CONTEXT_TEST_CLI to an installed Codex binary; requires Node and local HTTP only"]
fn real_cli_context_compaction_follows_gui_capacity() {
    let executable =
        std::env::var_os("CODEX_CONTEXT_TEST_CLI").expect("CODEX_CONTEXT_TEST_CLI is required");
    let mut configurations = json!({});
    for (name, capacity) in [
        ("large", Some(1_000_000)),
        ("small", Some(400_000)),
        ("default", None),
    ] {
        let mut params = json!({});
        apply_capacity(&mut params, &ContextSettings { capacity });
        configurations[name] = params["config"].clone();
    }
    let script = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../scripts/codex-gui-context-compaction-smoke.mjs");
    let output = std::process::Command::new("node")
        .arg(script)
        .arg(executable)
        .arg(configurations.to_string())
        .output()
        .expect("run the context compaction fixture");
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    println!("{}", String::from_utf8_lossy(&output.stdout));
}
