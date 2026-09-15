use super::super::home_migration::{migrate_between_homes, HomeMigrationError};
use super::*;

fn source_fixture() -> Fixture {
    let fixture = Fixture::new();
    fixture.sql(STATE, "DELETE FROM thread_spawn_edges");
    fixture
}

fn migrate(
    source: &Fixture,
    target: &Fixture,
    ids: &[&str],
) -> Result<MigrationReport, HomeMigrationError> {
    migrate_between_homes(
        &source.home,
        &target.home,
        &source.bin,
        ids.iter().map(|id| id.to_string()).collect(),
    )
}

#[test]
fn same_project_path_preserves_both_histories_and_relocates_rollout() {
    let source = source_fixture();
    let target = source_fixture();
    target.discard();
    let untouched = target.dump(OTHER);
    let source_other = source.dump(OTHER);
    let bytes = fs::read(source.snapshot().path).unwrap();
    let report = migrate(&source, &target, &[THREAD]).unwrap();
    assert_eq!(report.migrated_count, 1);
    assert_eq!(report.skipped_count, 0);
    assert_eq!(target.dump(OTHER), untouched);
    assert_eq!(source.dump(OTHER), source_other);
    assert_eq!(fs::read(target.snapshot().path).unwrap(), bytes);
    assert_eq!(target.snapshot().cwd, "D:/work");
    assert!(Path::new(&target.visibility().rollout_path).starts_with(&target.home));
    assert_eq!(
        target
            .rows(HISTORY, "thread_items", "thread_id = 'thread-a'")
            .len(),
        2
    );
    assert!(index_values(&target.home).unwrap().contains_key(THREAD));
    assert!(!index_values(&source.home).unwrap().contains_key(THREAD));
    source.assert_removed();
}

#[test]
fn duplicate_identity_stays_in_source_and_never_overwrites_target() {
    let source = source_fixture();
    let target = source_fixture();
    let before_source = source.dump(THREAD);
    let before_target = target.dump(THREAD);
    let report = migrate(&source, &target, &[THREAD, THREAD, "missing"]).unwrap();
    assert_eq!(report.requested_count, 2);
    assert_eq!(report.migrated_count, 0);
    assert_eq!(report.skipped_count, 2);
    assert_eq!(source.dump(THREAD), before_source);
    assert_eq!(target.dump(THREAD), before_target);
    assert!(source.entries().is_empty());
}

#[test]
fn failed_target_history_restore_returns_original_session_to_source() {
    let source = source_fixture();
    let target = source_fixture();
    target.discard();
    let before = source.dump(THREAD);
    let bytes = fs::read(source.snapshot().path).unwrap();
    target.sql(HISTORY, "ALTER TABLE thread_items RENAME TO suspended");
    assert!(migrate(&source, &target, &[THREAD]).is_err());
    assert_eq!(source.dump(THREAD), before);
    assert_eq!(fs::read(source.snapshot().path).unwrap(), bytes);
    assert!(index_values(&source.home).unwrap().contains_key(THREAD));
    assert!(!index_values(&target.home).unwrap().contains_key(THREAD));
    assert!(!target.home.join("sessions/rollout-thread-a.jsonl").exists());
}

#[test]
fn same_home_alias_and_empty_selection_are_rejected_without_writes() {
    let source = source_fixture();
    let before = source.dump(THREAD);
    let alias = source.home.join(".");
    assert!(matches!(
        migrate_between_homes(&source.home, &alias, &source.bin, vec![THREAD.into()]),
        Err(HomeMigrationError::SameHome)
    ));
    let target = source_fixture();
    assert!(matches!(
        migrate(&source, &target, &[]),
        Err(HomeMigrationError::EmptySelection)
    ));
    assert_eq!(source.dump(THREAD), before);
}

#[test]
fn unselected_dependent_conversation_blocks_migration() {
    let source = Fixture::new();
    let target = source_fixture();
    target.discard();
    let before = source.dump(THREAD);
    assert!(matches!(
        migrate(&source, &target, &[THREAD]),
        Err(HomeMigrationError::Dependencies)
    ));
    assert_eq!(source.dump(THREAD), before);
}

#[test]
fn uninitialized_target_keeps_original_conversation() {
    let source = source_fixture();
    let target = source.root.join("new-home");
    fs::create_dir_all(&target).unwrap();
    let before = source.dump(THREAD);
    assert!(
        migrate_between_homes(&source.home, &target, &source.bin, vec![THREAD.into()]).is_err()
    );
    assert_eq!(source.dump(THREAD), before);
    assert!(source.snapshot().path.exists());
}

#[test]
fn database_local_log_ids_do_not_replace_another_conversations_logs() {
    let source = source_fixture();
    let target = source_fixture();
    target.discard();
    for fixture in [&source, &target] {
        fixture.sql(
            "logs_1.sqlite",
            "CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT, message TEXT)",
        );
    }
    source.sql(
        "logs_1.sqlite",
        "INSERT INTO logs VALUES (1, 'thread-a', 'source log')",
    );
    target.sql(
        "logs_1.sqlite",
        "INSERT INTO logs VALUES (1, 'thread-b', 'target log')",
    );
    let original = target.rows("logs_1.sqlite", "logs", "thread_id = 'thread-b'");
    assert_eq!(
        migrate(&source, &target, &[THREAD]).unwrap().migrated_count,
        1
    );
    assert_eq!(
        target.rows("logs_1.sqlite", "logs", "thread_id = 'thread-b'"),
        original
    );
    assert_eq!(
        target
            .rows("logs_1.sqlite", "logs", "thread_id = 'thread-a'")
            .len(),
        1
    );
    assert!(source
        .rows("logs_1.sqlite", "logs", "thread_id = 'thread-a'")
        .is_empty());
}

#[test]
fn rejected_target_log_write_restores_original_logs_and_session() {
    let source = source_fixture();
    let target = source_fixture();
    target.discard();
    for fixture in [&source, &target] {
        fixture.sql(
            "logs_1.sqlite",
            "CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT, message TEXT);
             INSERT INTO logs VALUES (1, 'thread-a', 'source log'), (2, 'thread-b', 'target log')",
        );
    }
    target.sql(
        "logs_1.sqlite",
        "DELETE FROM logs WHERE thread_id = 'thread-a';
         CREATE TRIGGER reject_migration BEFORE INSERT ON logs WHEN NEW.thread_id = 'thread-a'
         BEGIN SELECT RAISE(ABORT, 'target log unavailable'); END;",
    );
    let source_logs = source.rows("logs_1.sqlite", "logs", "1 = 1");
    let target_logs = target.rows("logs_1.sqlite", "logs", "1 = 1");
    let original = source.dump(THREAD);
    assert!(migrate(&source, &target, &[THREAD]).is_err());
    assert_eq!(source.dump(THREAD), original);
    assert_eq!(source.rows("logs_1.sqlite", "logs", "1 = 1"), source_logs);
    assert_eq!(target.rows("logs_1.sqlite", "logs", "1 = 1"), target_logs);
    assert!(source.snapshot().path.exists());
    assert!(!target.home.join("sessions/rollout-thread-a.jsonl").exists());
}
