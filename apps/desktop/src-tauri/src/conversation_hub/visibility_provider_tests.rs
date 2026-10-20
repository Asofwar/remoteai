use super::*;

#[test]
fn visibility_preview_and_repair_preserve_paginated_files() {
    let root = tempfile::tempdir().unwrap();
    for compressed in [false, true] {
        let path = root.path().join(if compressed {
            "parent.jsonl.zst"
        } else {
            "parent.jsonl"
        });
        for history_mode in ["paginated", "future", "legacy"] {
            let contents = format!(
                "{}\n{}\n",
                json!({"type": "session_meta", "payload": {"id": "parent",
                    "model_provider": "codex-switch-local", "history_mode": history_mode}}),
                json!({"type": "event_msg", "payload": {"type": "task_started"}}),
            );
            let before = if compressed {
                zstd::stream::encode_all(contents.as_bytes(), 1).unwrap()
            } else {
                contents.into_bytes()
            };
            fs::write(&path, &before).unwrap();
            let should_update = history_mode == "legacy";
            assert_eq!(
                rollout_needs_provider_update(&path, "openai"),
                should_update
            );
            assert_eq!(
                rewrite_rollout_provider(&path, "openai").unwrap(),
                should_update
            );
            assert!(!rollout_needs_provider_update(&path, "openai"));
            if !should_update {
                assert_eq!(fs::read(&path).unwrap(), before);
            }
        }
    }
}
