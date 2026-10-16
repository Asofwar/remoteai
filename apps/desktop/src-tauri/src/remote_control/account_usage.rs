//! Runs account operations away from both the UI and the device control socket.
use std::{
    collections::HashSet,
    sync::{mpsc, Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};
use tauri::Runtime;

use crate::models::UsageSummary;

const MAX_CONCURRENT_OPERATIONS: usize = 4;
static ACTIVE_ACCOUNTS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
enum UsageError {
    #[error("暂时无法处理账号用量，请稍后重试。")]
    Unavailable,
    #[error("电脑正在处理账号用量，请稍候。")]
    Busy,
    #[error("电脑上没有这个账号，请先同步账号后重试。")]
    MissingAccount,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(super) enum UsageAction {
    Refresh,
    Consume,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageResult {
    usage: Option<UsageSummary>,
    consumed: bool,
    error: Option<String>,
}

struct AccountGuard(String);

impl AccountGuard {
    fn acquire(id: &str) -> Result<Self, UsageError> {
        let mut active = ACTIVE_ACCOUNTS
            .get_or_init(Mutex::default)
            .lock()
            .map_err(|_| UsageError::Unavailable)?;
        if active.len() >= MAX_CONCURRENT_OPERATIONS || active.contains(id) {
            return Err(UsageError::Busy);
        }
        active.insert(id.to_owned());
        Ok(Self(id.to_owned()))
    }
}

impl Drop for AccountGuard {
    fn drop(&mut self) {
        match ACTIVE_ACCOUNTS.get_or_init(Mutex::default).lock() {
            Ok(mut active) => {
                active.remove(&self.0);
            }
            Err(error) => eprintln!("Could not release account usage operation: {error}"),
        }
    }
}

pub(super) struct UsageHost {
    sender: mpsc::Sender<serde_json::Value>,
    receiver: mpsc::Receiver<serde_json::Value>,
}

impl UsageHost {
    pub(super) fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        Self { sender, receiver }
    }

    pub(super) fn request<R: Runtime>(
        &self,
        app: tauri::AppHandle<R>,
        command: String,
        input: (String, UsageAction),
    ) {
        let sender = self.sender.clone();
        tauri::async_runtime::spawn(async move {
            let data = execute(app, input.0, input.1).await;
            let response = serde_json::json!({
                "type": "account-usage-result", "commandId": command, "data": data,
            });
            // A disconnected browser must not cause a quota-consuming request to be replayed.
            if sender.send(response).is_err() {
                eprintln!("Account usage finished after the control connection closed");
            }
        });
    }

    pub(super) fn responses(&self) -> Vec<serde_json::Value> {
        self.receiver.try_iter().collect()
    }
}

fn valid_account_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 160
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

async fn execute<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    action: UsageAction,
) -> UsageResult {
    if !valid_account_id(&id) {
        return failed("账号无效，请重新选择账号。");
    }
    let _guard = match AccountGuard::acquire(&id) {
        Ok(guard) => guard,
        Err(error) => return failed(error),
    };
    if let Err(error) = ensure_account(&app, &id).await {
        return failed(error);
    }
    let mut result = UsageResult::default();
    if action == UsageAction::Consume {
        match crate::commands::consume_account_quota(app.clone(), id.clone()).await {
            Ok(()) => result.consumed = true,
            Err(error) => {
                eprintln!("Remote quota consumption failed: {error}");
                result.error = Some("电脑未确认额度消耗完成，请先查看用量，避免重复消耗。".into());
            }
        }
    }
    // The local UI may hide network errors and return cached usage. Remote callers need
    // an actual refresh result so a completed consumption cannot look safe to repeat.
    let refreshed = tauri::async_runtime::spawn_blocking(move || {
        crate::commands::try_refresh_usage_blocking(&app, &id)
    })
    .await;
    match refreshed {
        Ok(Ok(usage)) => result.usage = Some(usage),
        _ => {
            if result.error.is_none() {
                result.error = Some(
                    if result.consumed {
                        "额度已消耗，但用量刷新失败，请稍后刷新用量。"
                    } else {
                        "用量刷新失败，请稍后重试。"
                    }
                    .into(),
                );
            }
        }
    }
    result
}

fn failed(error: impl std::fmt::Display) -> UsageResult {
    UsageResult {
        error: Some(error.to_string()),
        ..UsageResult::default()
    }
}

async fn ensure_account<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Result<(), UsageError> {
    let accounts = crate::commands::list_accounts(app.clone())
        .await
        .map_err(|_| UsageError::MissingAccount)?;
    if accounts.iter().any(|account| account.id == id) {
        return Ok(());
    }
    // Accounts newly added from the browser may not have reached the computer's next sync yet.
    let sync = crate::cloud::cloud_pull_account(app.clone(), id.to_owned())
        .await
        .map_err(|_| UsageError::MissingAccount)?;
    if sync.downloaded == 0 {
        return Err(UsageError::MissingAccount);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_and_invalid_account_ids() {
        for id in ["", "../secret", "a/b", "a\\b", "C:secret", ".", "a\0b"] {
            assert!(!valid_account_id(id));
        }
        assert!(!valid_account_id(&"a".repeat(161)));
        assert!(valid_account_id("account-123_abc"));
    }

    #[test]
    fn reserves_accounts_until_operation_finishes_even_after_disconnect() {
        let guard = AccountGuard::acquire("usage-test-account").unwrap();
        assert!(AccountGuard::acquire("usage-test-account").is_err());
        drop(guard);
        assert!(AccountGuard::acquire("usage-test-account").is_ok());
    }
}
