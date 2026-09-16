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
    #[error("关联会话的历史记录不完整，请先恢复缺失的会话后重试")]
    MissingHistory,
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
    super::home_migration_plan::plan_home_migration(source, target, requested).map_err(|detail| {
        eprintln!("Could not prepare home migration: {detail}");
        match detail {
            super::home_migration_plan::MigrationPlanError::MissingHistory => {
                HomeMigrationError::MissingHistory
            }
            super::home_migration_plan::MigrationPlanError::Storage(_) => {
                HomeMigrationError::Incomplete { completed: 0 }
            }
        }
    })
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
    let completed = snapshots.len();
    let selected_count = snapshots
        .iter()
        .filter(|item| requested.contains(&item.session_id))
        .count();
    let skipped = requested.len() - selected_count;
    let batch = bin.join(format!("home-migration-{}", Uuid::new_v4()));
    if !snapshots.is_empty() {
        if let Err(error) =
            super::home_migration_batch::migrate_home_batch(source, target, &batch, snapshots)
        {
            eprintln!("Home migration batch failed: {error}");
            return Err(HomeMigrationError::Incomplete { completed: 0 });
        }
    }
    Ok(MigrationReport {
        requested_count: requested.len(),
        migrated_count: completed,
        skipped_count: skipped,
        message: format!(
            "已迁移 {completed} 条会话（含 {} 条关联会话），跳过 {skipped} 条所选会话",
            completed - selected_count
        ),
    })
}
