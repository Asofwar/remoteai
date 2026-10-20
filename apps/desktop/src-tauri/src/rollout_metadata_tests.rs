use super::*;
use serde_json::json;
use std::fs;

fn fixture(path: &Path, payload: Value, compressed: bool) -> Vec<u8> {
    let contents = format!(
        "{}\r\n{{ \"unknown_record\": \"保留原始字节\" }}\r\n",
        json!({"type": "session_meta", "payload": payload})
    );
    let bytes = if compressed {
        zstd::stream::encode_all(contents.as_bytes(), 1).unwrap()
    } else {
        contents.into_bytes()
    };
    fs::write(path, &bytes).unwrap();
    bytes
}

#[test]
fn paginated_and_future_formats_are_byte_for_byte_unchanged() {
    let root = tempfile::tempdir().unwrap();
    for compressed in [false, true] {
        let path = root.path().join(if compressed {
            "parent.jsonl.zst"
        } else {
            "parent.jsonl"
        });
        for history in [
            json!({"history_mode": "paginated"}),
            json!({"history_mode": "future"}),
            json!({"history_mode": 42}),
            json!({"history_base": {"thread_id": "parent", "end_byte_offset": 4096}}),
            json!({"forked_from_ordinal_exclusive": 42}),
            json!({"history_mode": "legacy", "history_base": {}}),
            json!({"forked_from_ordinal_exclusive": 0}),
        ] {
            let mut payload = history;
            payload["model_provider"] = json!("codex-switch-local");
            let before = fixture(&path, payload, compressed);
            for source in [None, Some("codex-switch-local")] {
                assert!(!update_provider(&path, source, "openai").unwrap());
                assert_eq!(fs::read(&path).unwrap(), before);
            }
        }
    }
}

#[test]
fn legacy_provider_change_keeps_unknown_metadata_and_exact_body_bytes() {
    let root = tempfile::tempdir().unwrap();
    for compressed in [false, true] {
        let path = root.path().join(if compressed {
            "legacy.jsonl.zst"
        } else {
            "legacy.jsonl"
        });
        fixture(
            &path,
            json!({"model_provider": "openai", "future": {"keep": 7}}),
            compressed,
        );
        let mut before = Vec::new();
        open_reader(&path)
            .unwrap()
            .read_to_end(&mut before)
            .unwrap();
        let tail = &before[before.iter().position(|byte| *byte == b'\n').unwrap() + 1..];
        assert!(update_provider(&path, Some("openai"), "codex-switch-local").unwrap());
        let mut reader = open_reader(&path).unwrap();
        let mut first = String::new();
        reader.read_line(&mut first).unwrap();
        let meta: Value = serde_json::from_str(&first).unwrap();
        assert_eq!(meta["payload"]["future"]["keep"], 7);
        assert_eq!(meta["payload"]["model_provider"], "codex-switch-local");
        let mut after = Vec::new();
        reader.read_to_end(&mut after).unwrap();
        assert_eq!(after, tail);
        drop(reader);
        let changed = fs::read(&path).unwrap();
        assert!(!update_provider(&path, Some("openai"), "another-provider").unwrap());
        assert!(!update_provider(&path, None, "codex-switch-local").unwrap());
        assert_eq!(fs::read(&path).unwrap(), changed);
    }
}

#[test]
fn invalid_metadata_never_replaces_the_original() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("invalid.jsonl");
    for contents in [
        "",
        "not json\n",
        "{\"type\":\"response_item\",\"payload\":{}}\n",
        "{\"type\":\"session_meta\",\"payload\":null}\n",
        "{\"type\":\"session_meta\",\"payload\":[]}\n",
        "null\n",
    ] {
        fs::write(&path, contents).unwrap();
        assert!(update_provider(&path, None, "openai").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), contents);
    }
    fixture(&path, json!({}), false);
    let before = fs::read(&path).unwrap();
    assert!(update_provider(&path, Some("openai"), "codex-switch-local").is_err());
    assert_eq!(fs::read(&path).unwrap(), before);
    assert!(update_provider(&path, None, "openai").unwrap());
}

#[test]
fn explicit_legacy_and_null_history_markers_remain_editable() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("legacy.jsonl");
    for mode in [json!("legacy"), Value::Null] {
        fixture(
            &path,
            json!({"model_provider": "openai", "history_mode": mode,
                "history_base": null, "forked_from_ordinal_exclusive": null}),
            false,
        );
        assert!(update_provider(&path, Some("openai"), "codex-switch-local").unwrap());
    }
}

#[test]
fn filesystem_errors_do_not_expose_paths_to_callers() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("private-history.jsonl");
    let error = update_provider(&path, None, "openai").unwrap_err();
    assert!(matches!(error, MetadataError::Io(_)));
    assert!(!error.to_string().contains("private-history"));
}
