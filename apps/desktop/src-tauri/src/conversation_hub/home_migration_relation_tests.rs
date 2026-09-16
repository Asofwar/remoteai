use super::home_migration::{migrate, source_fixture};
use super::*;

fn dependent(fixture: &Fixture, id: &str, parent: &str) -> PathBuf {
    let path = fixture.rollout(&format!("sessions/rollout-{id}.jsonl"), id);
    let content = fs::read_to_string(&path).unwrap();
    let (first, rest) = content.split_once('\n').unwrap();
    let mut meta: Value = serde_json::from_str(first).unwrap();
    meta["payload"]["history_base"] = json!({"thread_id": parent});
    fs::write(&path, format!("{meta}\n{rest}")).unwrap();
    path
}

#[test]
fn selecting_a_parent_includes_unselected_history_descendants() {
    let source = source_fixture();
    let target = source_fixture();
    target.discard();
    let child = dependent(&source, "child", THREAD);
    let grandchild = dependent(&source, "grandchild", "child");
    let bytes = fs::read(&child).unwrap();
    let report = migrate(&source, &target, &[THREAD]).unwrap();
    assert_eq!(report.requested_count, 1);
    assert_eq!(report.migrated_count, 3);
    assert_eq!(report.skipped_count, 0);
    assert!(!child.exists());
    assert!(!grandchild.exists());
    assert_eq!(
        fs::read(target.home.join("sessions/rollout-child.jsonl")).unwrap(),
        bytes
    );
    source.assert_removed();
}

#[test]
fn selecting_a_child_includes_its_parent_and_spawn_siblings() {
    let source = Fixture::new();
    let target = source_fixture();
    target.discard();
    source.rollout("sessions/rollout-child-a.jsonl", "child-a");
    source.rollout("sessions/rollout-child-b.jsonl", "child-b");
    source.sql(
        STATE,
        "INSERT INTO thread_spawn_edges VALUES ('thread-a', 'child-b', 'completed')",
    );
    let edges = source.rows(STATE, "thread_spawn_edges", "1 = 1");
    let report = migrate(&source, &target, &["child-a"]).unwrap();
    assert_eq!(report.migrated_count, 3);
    assert_eq!(target.rows(STATE, "thread_spawn_edges", "1 = 1"), edges);
    assert!(source.rows(STATE, "thread_spawn_edges", "1 = 1").is_empty());
}

#[test]
fn parent_already_in_target_does_not_block_moving_child() {
    let source = source_fixture();
    let target = source_fixture();
    let before = target.dump(THREAD);
    let child = dependent(&source, "child", THREAD);
    let report = migrate(&source, &target, &[THREAD, "child"]).unwrap();
    assert_eq!(report.migrated_count, 1);
    assert_eq!(report.skipped_count, 1);
    assert_eq!(target.dump(THREAD), before);
    assert!(!child.exists());
    assert!(source.snapshot().path.exists());
}

#[test]
fn skipped_child_keeps_its_required_source_history() {
    let source = source_fixture();
    let target = source_fixture();
    target.discard();
    dependent(&source, "child", THREAD);
    dependent(&target, "child", THREAD);
    let before = source.dump(THREAD);
    let report = migrate(&source, &target, &[THREAD, "child"]).unwrap();
    assert_eq!(report.migrated_count, 0);
    assert_eq!(report.skipped_count, 2);
    assert_eq!(source.dump(THREAD), before);
}

#[test]
fn failure_after_parent_restore_rolls_back_the_whole_family() {
    let source = Fixture::new();
    let target = source_fixture();
    target.discard();
    source.rollout("sessions/rollout-zz-child.jsonl", "zz-child");
    source.sql(
        STATE,
        "DELETE FROM thread_spawn_edges;
        INSERT INTO thread_spawn_edges VALUES ('thread-a', 'zz-child', 'completed')",
    );
    source.sql(
        STATE,
        "INSERT INTO threads SELECT 'zz-child', rollout_path, archived, archived_at,
        preview, title, model_provider FROM threads WHERE id = 'thread-a'",
    );
    target.sql(
        STATE,
        "CREATE TRIGGER reject_child BEFORE INSERT ON threads WHEN NEW.id = 'zz-child'
        BEGIN SELECT RAISE(ABORT, 'test failure'); END",
    );
    let before = source.dump(THREAD);
    let target_before = target.dump(OTHER);
    assert!(migrate(&source, &target, &[THREAD]).is_err());
    assert_eq!(source.dump(THREAD), before);
    assert!(source.snapshot().path.exists());
    assert_eq!(target.dump(OTHER), target_before);
    assert!(target.rows(STATE, "threads", "id = 'thread-a'").is_empty());
    assert!(!target.home.join("sessions/rollout-thread-a.jsonl").exists());
}

#[test]
fn failed_source_cleanup_restores_all_files_history_and_edges() {
    let source = Fixture::new();
    let target = source_fixture();
    target.discard();
    source.rollout("sessions/rollout-child-a.jsonl", "child-a");
    source.sql(
        STATE,
        "CREATE TRIGGER reject_removal BEFORE DELETE ON threads WHEN OLD.id = 'thread-a'
        BEGIN SELECT RAISE(ABORT, 'source busy'); END",
    );
    let before = source.dump(THREAD);
    let child = fs::read(source.home.join("sessions/rollout-child-a.jsonl")).unwrap();
    let original_target = target.dump(OTHER);
    assert!(migrate(&source, &target, &[THREAD]).is_err());
    assert_eq!(source.dump(THREAD), before);
    assert!(source.snapshot().path.exists());
    assert_eq!(
        fs::read(source.home.join("sessions/rollout-child-a.jsonl")).unwrap(),
        child
    );
    assert_eq!(target.dump(OTHER), original_target);
    assert!(target.rows(STATE, "thread_spawn_edges", "1 = 1").is_empty());
    assert!(!target.home.join("sessions/rollout-child-a.jsonl").exists());
    assert!(!target.home.join("sessions/rollout-thread-a.jsonl").exists());
}

#[test]
fn modern_spawn_metadata_works_without_a_database_edge() {
    let source = source_fixture();
    let target = source_fixture();
    target.discard();
    let child = source.rollout("archived_sessions/rollout-child.jsonl", "child");
    let meta = json!({"type":"session_meta", "payload": {"id":"child", "cwd":"D:/work",
        "source":{"subagent":{"thread_spawn":{"parent_thread_id":THREAD}}}}});
    fs::write(&child, format!("{meta}\n")).unwrap();
    let report = migrate(&source, &target, &[THREAD]).unwrap();
    assert_eq!(report.migrated_count, 2);
    assert!(!child.exists());
    assert!(target
        .home
        .join("archived_sessions/rollout-child.jsonl")
        .exists());
}

#[test]
fn missing_required_history_blocks_before_any_write() {
    let source = source_fixture();
    let target = source_fixture();
    let path = dependent(&source, "child", "missing-history");
    let bytes = fs::read(&path).unwrap();
    assert!(migrate(&source, &target, &["child"]).is_err());
    assert_eq!(fs::read(path).unwrap(), bytes);
    assert!(source.entries().is_empty());
    assert!(!target.home.join("sessions/rollout-child.jsonl").exists());
}

#[test]
fn fifty_selected_sessions_include_hidden_children_and_skip_duplicates() {
    let source = source_fixture();
    let target = source_fixture();
    let ids = (0..50)
        .map(|index| format!("batch-{index:02}"))
        .collect::<Vec<_>>();
    for id in &ids {
        source.rollout(&format!("sessions/rollout-{id}.jsonl"), id);
    }
    dependent(&source, "hidden-child", &ids[0]);
    dependent(&source, "hidden-grandchild", "hidden-child");
    let duplicate = target.rollout("sessions/rollout-batch-17.jsonl", &ids[17]);
    let duplicate_bytes = fs::read(&duplicate).unwrap();
    let untouched = source.dump(THREAD);
    let report = migrate(
        &source,
        &target,
        &ids.iter().map(String::as_str).collect::<Vec<_>>(),
    )
    .unwrap();
    assert_eq!(report.requested_count, 50);
    assert_eq!(report.migrated_count, 51);
    assert_eq!(report.skipped_count, 1);
    assert_eq!(fs::read(duplicate).unwrap(), duplicate_bytes);
    assert_eq!(source.dump(THREAD), untouched);
    assert!(source.home.join("sessions/rollout-batch-17.jsonl").exists());
    assert!(target
        .home
        .join("sessions/rollout-hidden-grandchild.jsonl")
        .exists());
    assert!(!source
        .home
        .join("sessions/rollout-hidden-child.jsonl")
        .exists());
}

#[test]
fn destination_created_after_planning_is_not_overwritten() {
    let source = source_fixture();
    let target = source_fixture();
    let before = target.dump(THREAD);
    let snapshot = source.snapshot();
    fs::remove_file(target.snapshot().path).unwrap();
    let result = super::super::home_migration_batch::migrate_home_batch(
        &source.home,
        &target.home,
        &source.bin.join("late-duplicate"),
        vec![snapshot],
    );
    assert!(result.is_err());
    assert_eq!(target.dump(THREAD), before);
    assert!(source.snapshot().path.exists());
    assert!(!target.home.join("sessions/rollout-thread-a.jsonl").exists());
}

#[test]
fn target_database_row_without_history_cannot_satisfy_a_history_dependency() {
    let source = source_fixture();
    let target = source_fixture();
    let child = dependent(&source, "child", THREAD);
    fs::remove_file(target.snapshot().path).unwrap();
    assert!(migrate(&source, &target, &["child"]).is_err());
    assert!(child.exists());
    assert!(source.snapshot().path.exists());
    assert!(!target.home.join("sessions/rollout-child.jsonl").exists());
}
