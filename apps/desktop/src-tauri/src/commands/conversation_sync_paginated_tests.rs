use std::path::Path;

fn seed_paginated_sync_state(home: &Path, path: &Path) {
    let state = Connection::open(home.join("state_5.sqlite")).unwrap();
    state
        .execute_batch(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, model_provider TEXT);",
        )
        .unwrap();
    for (id, rollout) in [
        ("parent", path.to_path_buf()),
        ("child", home.join("child.jsonl")),
    ] {
        state
            .execute(
                "INSERT INTO threads VALUES (?1, ?2, ?3)",
                (
                    id,
                    rollout.to_string_lossy().as_ref(),
                    LOCAL_PROXY_CONVERSATION_PROVIDER,
                ),
            )
            .unwrap();
    }
    fs::create_dir(home.join("sqlite")).unwrap();
    Connection::open(home.join("sqlite/catalog.db"))
        .unwrap()
        .execute_batch(
            "CREATE TABLE local_thread_catalog (thread_id TEXT PRIMARY KEY, model_provider TEXT);
             INSERT INTO local_thread_catalog VALUES ('parent', 'codex-switch-local'),
                                                    ('child', 'codex-switch-local');",
        )
        .unwrap();
}

fn assert_paginated_sync_routing(home: &Path, expected: &str) {
    for (database, table) in [
        ("state_5.sqlite", "threads"),
        ("sqlite/catalog.db", "local_thread_catalog"),
    ] {
        let state = Connection::open(home.join(database)).unwrap();
        let count: usize = state
            .query_row(
                &format!("SELECT COUNT(*) FROM {table} WHERE model_provider = ?1"),
                [expected],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2, "{database}");
    }
}

fn paginated_sync_fixture(compressed: bool) -> (tempfile::TempDir, PathBuf, Vec<u8>) {
    let home = tempfile::tempdir().unwrap();
    let path = home.path().join(if compressed {
        "parent.jsonl.zst"
    } else {
        "parent.jsonl"
    });
    let contents = format!(
        "{}\r\n{}\n",
        json!({"type": "session_meta", "payload": {
            "id": "parent", "history_mode": "paginated",
            "model_provider": LOCAL_PROXY_CONVERSATION_PROVIDER,
            "future_field": "preserve 中文"
        }}),
        json!({"type": "future_record", "payload": {"text": "synthetic history"}}),
    );
    let cutoff = contents.len();
    let bytes = if compressed {
        zstd::stream::encode_all(contents.as_bytes(), 1).unwrap()
    } else {
        contents.into_bytes()
    };
    fs::write(&path, &bytes).unwrap();
    seed_paginated_sync_state(home.path(), &path);
    fs::write(
        home.path().join("child.jsonl"),
        format!(
            "{}\n",
            json!({
                "type": "session_meta", "payload": {
                    "model_provider": LOCAL_PROXY_CONVERSATION_PROVIDER, "history_mode": "paginated",
                    "history_base": {"thread_id": "parent", "end_ordinal_exclusive": 2,
                        "end_byte_offset": cutoff}}
            })
        ),
    )
    .unwrap();
    (home, path, bytes)
}

#[test]
fn proxy_round_trip_preserves_paginated_parent_bytes_and_child_cutoff() {
    for compressed in [false, true] {
        let (home, path, before) = paginated_sync_fixture(compressed);
        let child_before = fs::read(home.path().join("child.jsonl")).unwrap();
        let restored = restore_conversation_metadata_if_present(home.path()).unwrap();
        assert_eq!(restored.conversations_updated, 2);
        assert_eq!(restored.rollout_files_updated, 0);
        assert_eq!(fs::read(&path).unwrap(), before);
        assert_paginated_sync_routing(home.path(), OFFICIAL_CONVERSATION_PROVIDER);
        let synced =
            sync_conversation_metadata_if_present_with_progress(home.path(), &mut |_, _| {})
                .unwrap();
        assert_eq!(synced.conversations_updated, 2);
        assert_eq!(synced.rollout_files_updated, 0);
        assert_eq!(fs::read(&path).unwrap(), before);
        assert_eq!(
            fs::read(home.path().join("child.jsonl")).unwrap(),
            child_before
        );
        assert_paginated_sync_routing(home.path(), LOCAL_PROXY_CONVERSATION_PROVIDER);
    }
}

#[test]
fn failed_proxy_transition_keeps_paginated_bytes_and_routing() {
    let (home, parent, before) = paginated_sync_fixture(false);
    fs::write(home.path().join("child.jsonl"), "invalid metadata\n").unwrap();
    assert!(restore_conversation_metadata_if_present(home.path()).is_err());
    assert_eq!(fs::read(parent).unwrap(), before);
    assert_paginated_sync_routing(home.path(), LOCAL_PROXY_CONVERSATION_PROVIDER);
}
