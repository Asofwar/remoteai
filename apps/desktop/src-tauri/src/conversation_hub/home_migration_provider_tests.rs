use super::super::home_migration::{migrate_between_homes, HomeMigrationRequest};
use super::super::home_migration_provider::{MigrationDestination, MigrationModelProvider};
use super::home_migration::source_fixture;
use super::*;

fn migrate_with_provider(
    source: &Fixture,
    target: &Fixture,
    provider: MigrationModelProvider,
) -> Result<MigrationReport, super::super::home_migration::HomeMigrationError> {
    migrate_between_homes(
        &source.home,
        MigrationDestination {
            path: &target.home,
            model_provider: Some(provider),
        },
        &source.bin,
        vec![THREAD.into()],
    )
}

fn read_rollout(path: &Path) -> (Value, Vec<u8>) {
    let mut reader = rollout_reader(path).unwrap();
    let mut first = String::new();
    reader.read_line(&mut first).unwrap();
    let mut rest = Vec::new();
    reader.read_to_end(&mut rest).unwrap();
    (serde_json::from_str(&first).unwrap(), rest)
}

#[test]
fn selected_provider_updates_state_and_all_rollout_copies_without_changing_history() {
    for provider in [
        MigrationModelProvider::Openai,
        MigrationModelProvider::Local,
        MigrationModelProvider::Gui,
    ] {
        let source = source_fixture();
        let target = source_fixture();
        target.discard();
        let compressed = source.rollout("archived_sessions/rollout-thread-a.jsonl.zst", THREAD);
        rewrite_rollout_provider(&compressed, "old-provider").unwrap();
        let rest = read_rollout(&source.snapshot().path).1;
        let untouched = target.dump(OTHER);
        let report = migrate_with_provider(&source, &target, provider).unwrap();
        assert_eq!(report.migrated_count, 1);
        for relative in [
            "sessions/rollout-thread-a.jsonl",
            "archived_sessions/rollout-thread-a.jsonl.zst",
        ] {
            let (meta, history) = read_rollout(&target.home.join(relative));
            assert_eq!(meta["payload"]["model_provider"], provider.as_str());
            assert_eq!(meta["payload"]["cwd"], "D:/work");
            assert_eq!(history, rest);
        }
        let state = snapshot_thread_row(Some(&target.home.join(STATE)), THREAD)
            .unwrap()
            .unwrap();
        assert_eq!(
            sqlite_row_text(&state, "model_provider"),
            Some(provider.as_str())
        );
        assert_eq!(target.dump(OTHER), untouched);
        source.assert_removed();
    }
}

#[test]
fn provider_change_includes_related_conversations_but_skips_existing_ones() {
    let source = Fixture::new();
    let target = source_fixture();
    target.discard();
    source.rollout("archived_sessions/rollout-child-a.jsonl.zst", "child-a");
    source.sql(
        STATE,
        "INSERT INTO thread_spawn_edges VALUES ('thread-a', 'thread-b', 'completed')",
    );
    let source_other = source.dump(OTHER);
    let target_other = target.dump(OTHER);
    let report = migrate_with_provider(&source, &target, MigrationModelProvider::Openai).unwrap();
    assert_eq!(report.migrated_count, 2);
    let (meta, _) = read_rollout(
        &target
            .home
            .join("archived_sessions/rollout-child-a.jsonl.zst"),
    );
    assert_eq!(meta["payload"]["model_provider"], "openai");
    // The parent's edge moves with it; the skipped thread's own data stays unchanged.
    let target_after = target.dump(OTHER);
    assert_eq!(target_after[0], target_other[0]);
    assert_eq!(target_after[2..], target_other[2..]);
    assert_eq!(source.dump(OTHER)[0], source_other[0]);
}

#[test]
fn provider_change_rolls_back_original_files_and_state_on_target_or_source_failure() {
    for fail_source in [false, true] {
        let source = source_fixture();
        let target = source_fixture();
        target.discard();
        rewrite_rollout_provider(&source.snapshot().path, "codex-switch-gui").unwrap();
        let original_bytes = fs::read(source.snapshot().path).unwrap();
        let original_state = source.dump(THREAD);
        let target_other = target.dump(OTHER);
        if fail_source {
            source.sql(
                STATE,
                "CREATE TRIGGER reject_removal BEFORE DELETE ON threads
                WHEN OLD.id = 'thread-a' BEGIN SELECT RAISE(ABORT, 'source busy'); END",
            );
        } else {
            target.sql(HISTORY, "ALTER TABLE thread_items RENAME TO suspended");
        }
        assert!(migrate_with_provider(&source, &target, MigrationModelProvider::Openai).is_err());
        assert_eq!(fs::read(source.snapshot().path).unwrap(), original_bytes);
        assert_eq!(source.dump(THREAD), original_state);
        if fail_source {
            assert_eq!(target.dump(OTHER), target_other);
        }
        assert!(target.rows(STATE, "threads", "id = 'thread-a'").is_empty());
        assert!(!target.home.join("sessions/rollout-thread-a.jsonl").exists());
    }
}

#[test]
fn migration_request_rejects_unknown_providers_and_accepts_legacy_requests() {
    let request = json!({"homeId":"source", "targetHomeId":"target", "sessionIds":[THREAD]});
    assert!(serde_json::from_value::<HomeMigrationRequest>(request.clone()).is_ok());
    for provider in ["openai", "codex-switch-local", "codex-switch-gui"] {
        let mut request = request.clone();
        request["modelProvider"] = json!(provider);
        assert!(serde_json::from_value::<HomeMigrationRequest>(request).is_ok());
    }
    let mut request = request;
    request["modelProvider"] = json!("unknown-provider");
    assert!(serde_json::from_value::<HomeMigrationRequest>(request).is_err());
}

#[test]
fn provider_migration_preserves_paginated_rollouts_and_updates_database_routing() {
    let source = source_fixture();
    let target = source_fixture();
    target.discard();
    let compressed = source.rollout("archived_sessions/rollout-thread-a.jsonl.zst", THREAD);
    let mut originals = Vec::new();
    for path in [
        source.home.join("sessions/rollout-thread-a.jsonl"),
        compressed,
    ] {
        let (mut meta, body) = read_rollout(&path);
        meta["payload"]["history_mode"] = json!("paginated");
        meta["payload"]["model_provider"] = json!("codex-switch-local");
        let mut bytes = serde_json::to_vec(&meta).unwrap();
        bytes.push(b'\n');
        bytes.extend(body);
        if path.extension().is_some_and(|extension| extension == "zst") {
            bytes = zstd::stream::encode_all(bytes.as_slice(), 1).unwrap();
        }
        fs::write(&path, &bytes).unwrap();
        originals.push((
            path.strip_prefix(&source.home).unwrap().to_path_buf(),
            bytes,
        ));
    }
    let report = migrate_with_provider(&source, &target, MigrationModelProvider::Openai).unwrap();
    assert_eq!(report.migrated_count, 1);
    for (relative, bytes) in originals {
        assert_eq!(fs::read(target.home.join(relative)).unwrap(), bytes);
    }
    let state = snapshot_thread_row(Some(&target.home.join(STATE)), THREAD)
        .unwrap()
        .unwrap();
    assert_eq!(sqlite_row_text(&state, "model_provider"), Some("openai"));
    source.assert_removed();
}
