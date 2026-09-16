use super::*;

struct PreparedSession {
    backup: BinSnapshot,
    source_files: Vec<(PathBuf, PathBuf)>,
    target_before: BinManifest,
    target_index: Option<Value>,
    created_files: Vec<PathBuf>,
    target_touched: bool,
    source_touched: bool,
}

/// Copy and verify the entire batch before removing anything from the source.
/// Original manifests remain durable until every related thread has committed.
pub(super) fn migrate_home_batch(
    source: &Path,
    target: &Path,
    batch: &Path,
    snapshots: Vec<RolloutSnapshot>,
) -> Result<(), String> {
    let mut prepared = Vec::new();
    for snapshot in snapshots {
        match prepare_session(source, target, batch, snapshot) {
            Ok(item) => prepared.push(item),
            Err(error) => return Err(cleanup_batch_error(batch, error)),
        }
    }
    let result = restore_batch_target(target, &mut prepared)
        .and_then(|()| remove_batch_source(source, &mut prepared));
    if let Err(error) = result {
        let rollback = rollback_batch(source, target, &prepared);
        return Err(match rollback {
            Ok(()) => cleanup_batch_error(batch, error),
            Err(rollback) => format!("{error}；还原未完成，迁移备份已保留：{rollback}"),
        });
    }
    // A cleanup failure must not misreport a committed migration as a failure.
    if let Err(error) = fs::remove_dir_all(batch) {
        eprintln!("Could not clean completed home migration backup: {error}");
    }
    Ok(())
}

fn cleanup_batch_error(batch: &Path, error: String) -> String {
    if !batch.exists() {
        return error;
    }
    with_bin_rollback_error(
        error,
        fs::remove_dir_all(batch).map_err(|error| error.to_string()),
    )
}

fn prepare_session(
    source: &Path,
    target: &Path,
    batch: &Path,
    snapshot: RolloutSnapshot,
) -> Result<PreparedSession, String> {
    let folder = batch.join(Uuid::new_v4().to_string());
    let mut source_files = Vec::new();
    for path in &snapshot.physical_paths {
        let relative = bin_rollout_relative(path, source)?;
        let backup = folder.join("files").join(relative);
        copy_verified_file(path, &backup)?;
        source_files.push((path.clone(), backup));
    }
    let manifest = bin_manifest_for_snapshot(source, snapshot)?;
    write_bin_manifest(&folder, &manifest)?;
    let mut target_before = manifest.clone();
    target_before.state_backup = Some(snapshot_bin_state(target, &manifest.session_id)?);
    let target_index = index_values(target)?.remove(&manifest.session_id);
    Ok(PreparedSession {
        backup: BinSnapshot {
            folder,
            manifest,
            rollouts: source_files.iter().map(|(_, path)| path.clone()).collect(),
        },
        source_files,
        target_before,
        target_index,
        created_files: Vec::new(),
        target_touched: false,
        source_touched: false,
    })
}

fn copy_verified_file(source: &Path, target: &Path) -> Result<(), String> {
    let parent = target.parent().ok_or_else(|| "迁移目录无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut input = File::open(source).map_err(|error| error.to_string())?;
    let mut output = File::options()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| error.to_string())?;
    let copied = std::io::copy(&mut input, &mut output).and_then(|_| output.sync_all());
    drop(output);
    let verified = copied.map_err(|error| error.to_string()).and_then(|_| {
        if sha256(source)? == sha256(target)? {
            Ok(())
        } else {
            Err("会话内容发生变化，请结束任务后重试".to_string())
        }
    });
    if let Err(error) = verified {
        return Err(with_bin_rollback_error(
            error,
            fs::remove_file(target).map_err(|error| error.to_string()),
        ));
    }
    Ok(())
}

fn restore_batch_target(target: &Path, prepared: &mut [PreparedSession]) -> Result<(), String> {
    let mut available = super::home_migration_plan::target_session_ids(target)?;
    available.extend(
        prepared
            .iter()
            .map(|item| item.backup.manifest.session_id.clone()),
    );
    for item in prepared.iter_mut() {
        for (source, destination) in bin_restore_targets(target, &item.backup)? {
            copy_verified_file(&source, &destination)?;
            item.created_files.push(destination);
        }
    }
    // Every history file must exist before a thread becomes visible in the
    // destination database, including bases stored in another rollout.
    for item in prepared {
        let mut manifest = relocated_bin_manifest(target, &item.backup.manifest)?;
        if snapshot_thread_row(latest_state_db(target).as_deref(), &manifest.session_id)?.is_some()
        {
            return Err("目标会话列表发生变化，请刷新后重试".to_string());
        }
        retain_available_edges(&mut manifest, &available);
        item.target_touched = true;
        restore_bin_state(target, &manifest)?;
        append_index_entry(target, &manifest.session_id, &manifest.session_index_entry)?;
    }
    Ok(())
}

fn retain_available_edges(manifest: &mut BinManifest, available: &HashSet<String>) {
    let Some(backup) = &mut manifest.state_backup else {
        return;
    };
    for table in backup
        .tables
        .iter_mut()
        .filter(|table| table.table == "thread_spawn_edges")
    {
        table.rows.retain(|row| {
            ["parent_thread_id", "child_thread_id"]
                .iter()
                .all(|column| sqlite_row_text(row, column).is_some_and(|id| available.contains(id)))
        });
    }
}

fn remove_batch_source(source: &Path, prepared: &mut [PreparedSession]) -> Result<(), String> {
    // Verify every source again before the first removal; an active session may
    // have appended records while the destination was being prepared.
    for item in prepared.iter() {
        for (path, backup) in &item.source_files {
            if sha256(path)? != sha256(backup)? {
                return Err("会话内容发生变化，请结束任务后重试".to_string());
            }
        }
    }
    for item in prepared {
        item.source_touched = true;
        for (path, _) in &item.source_files {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        finish_bin_removal(source, &item.backup.manifest.session_id)?;
    }
    Ok(())
}

fn rollback_batch(
    source: &Path,
    target: &Path,
    prepared: &[PreparedSession],
) -> Result<(), String> {
    let mut failures = Vec::new();
    // Restore all source manifests after the removals so an edge shared by two
    // sessions is restored from the original, complete snapshot.
    for item in prepared.iter().filter(|item| item.source_touched) {
        if let Err(error) = restore_source(source, item) {
            failures.push(error);
        }
    }
    for item in prepared.iter().rev() {
        if let Err(error) = rollback_target(target, item) {
            failures.push(error);
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("；"))
    }
}

fn restore_source(source: &Path, item: &PreparedSession) -> Result<(), String> {
    for (path, backup) in &item.source_files {
        if !path.exists() {
            copy_verified_file(backup, path)?;
        }
    }
    let manifest = &item.backup.manifest;
    restore_bin_state(source, manifest)?;
    append_index_entry(source, &manifest.session_id, &manifest.session_index_entry)
}

fn rollback_target(target: &Path, item: &PreparedSession) -> Result<(), String> {
    for path in &item.created_files {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    if !item.target_touched {
        return Ok(());
    }
    let id = &item.backup.manifest.session_id;
    finish_bin_removal(target, id)?;
    restore_bin_state(target, &item.target_before)?;
    if let Some(entry) = &item.target_index {
        append_index_entry(target, id, entry)?;
    }
    Ok(())
}
