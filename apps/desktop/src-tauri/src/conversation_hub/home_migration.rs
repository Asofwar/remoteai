use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HomeMigrationRequest {
    home_id: String,
    target_home_id: String,
    session_ids: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub(super) enum HomeMigrationError {
    #[error("请选择不同的 Codex Home")]
    SameHome,
    #[error("请至少选择一条会话")]
    EmptySelection,
    #[error("Codex Home 暂不可用，请确认目录存在后重试")]
    Unavailable,
    #[error("请将有关联的会话一起选择后迁移")]
    Dependencies,
    #[error("已迁移 {completed} 条会话，其余未完成。请关闭相关会话后重试；未完成的会话可在原目录或回收站中找到")]
    Incomplete { completed: usize },
}

#[tauri::command]
pub(crate) async fn migrate_codex_threads_to_home<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    request: HomeMigrationRequest,
) -> Result<MigrationReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = ThreadContext::new(app.clone(), Some(request.home_id))?;
        let target = crate::codex_home::resolve_selected(&app, Some(&request.target_home_id))?;
        let _guard = bin_operation_guard()?;
        let bin = bin_root(&source)?;
        migrate_between_homes(&source.paths.codex_home, &target, &bin, request.session_ids)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "会话迁移未完成，请重试".to_string())?
}

fn distinct_homes(source: &Path, target: &Path) -> Result<(), HomeMigrationError> {
    let source = fs::canonicalize(source).map_err(|_| HomeMigrationError::Unavailable)?;
    let target = fs::canonicalize(target).map_err(|_| HomeMigrationError::Unavailable)?;
    if source == target {
        return Err(HomeMigrationError::SameHome);
    }
    Ok(())
}

fn migration_candidates(
    source: &Path,
    target: &Path,
    requested: &HashSet<String>,
) -> Result<Vec<RolloutSnapshot>, HomeMigrationError> {
    let failed = |detail: String| {
        eprintln!("Could not prepare home migration: {detail}");
        HomeMigrationError::Incomplete { completed: 0 }
    };
    let all = merge_bin_snapshots(gather_snapshots(source).map_err(failed)?);
    let existing = live_bin_thread_ids(target).map_err(failed)?;
    let state = latest_state_db(target);
    let mut candidates = Vec::new();
    for snapshot in all
        .iter()
        .filter(|item| requested.contains(&item.session_id))
    {
        if existing.contains(&snapshot.session_id)
            || snapshot_thread_row(state.as_deref(), &snapshot.session_id)
                .map_err(failed)?
                .is_some()
        {
            continue;
        }
        if !snapshot.physical_paths.iter().any(|path| {
            bin_rollout_relative(path, source).is_ok_and(|relative| target.join(relative).exists())
        }) {
            candidates.push(snapshot.clone());
        }
    }
    let moving = candidates
        .iter()
        .map(|item| item.session_id.clone())
        .collect();
    ensure_threads_are_not_referenced(&all, &moving, latest_state_db(source).as_deref())
        .map_err(|_| HomeMigrationError::Dependencies)?;
    ensure_export_dependencies(&candidates).map_err(|_| HomeMigrationError::Dependencies)?;
    Ok(candidates)
}

pub(super) fn migrate_between_homes(
    source: &Path,
    target: &Path,
    bin: &Path,
    session_ids: Vec<String>,
) -> Result<MigrationReport, HomeMigrationError> {
    distinct_homes(source, target)?;
    let requested = normalized_ids(session_ids);
    if requested.is_empty() {
        return Err(HomeMigrationError::EmptySelection);
    }
    let snapshots = migration_candidates(source, target, &requested)?;
    let batch = bin.join(format!("home-migration-{}", Uuid::new_v4()));
    let mut completed = 0;
    for snapshot in snapshots {
        if let Err(error) = migrate_home_snapshot(source, target, &batch, snapshot) {
            eprintln!("Home migration stopped after {completed} sessions: {error}");
            return Err(HomeMigrationError::Incomplete { completed });
        }
        completed += 1;
    }
    Ok(MigrationReport {
        requested_count: requested.len(),
        migrated_count: completed,
        skipped_count: requested.len() - completed,
        message: format!(
            "已迁移 {completed} 条会话，跳过 {} 条",
            requested.len() - completed
        ),
    })
}

fn migrate_home_snapshot(
    source: &Path,
    target: &Path,
    batch: &Path,
    snapshot: RolloutSnapshot,
) -> Result<(), String> {
    let id = snapshot.session_id.clone();
    discard_thread_snapshot(source, batch, snapshot)?;
    let root = batch
        .parent()
        .ok_or_else(|| "迁移备份位置无效".to_string())?;
    let item = collect_bin_entries_at(root)?
        .into_iter()
        .find(|item| item.folder.parent() == Some(batch) && item.manifest.session_id == id)
        .ok_or_else(|| "无法读取迁移备份".to_string())?;
    match recover_bin_snapshot(target, &item) {
        Ok(true) => Ok(()),
        result => {
            // Recovery rolls target writes back before returning an error. Restore
            // the source too; if either rollback fails the durable bin remains available.
            let error = result
                .err()
                .unwrap_or_else(|| "目标已有相同会话".to_string());
            let rollback = recover_bin_snapshot(source, &item).and_then(|restored| {
                restored
                    .then_some(())
                    .ok_or_else(|| "原目录已有相同会话，备份已保留".to_string())
            });
            Err(with_bin_rollback_error(error, rollback))
        }
    }
}
