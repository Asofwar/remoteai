//! Rejoin only the idle conversation whose capacity changed; keep the app server and phone connected.
use std::{
    collections::HashMap,
    sync::{atomic::AtomicU64, Arc},
};

use serde_json::{json, Value};
use tokio::sync::Mutex;

use super::Client;
use crate::codex_gui::{
    context_settings::{self, ContextSettings},
    error::{GuiError, Result},
};

#[derive(Default)]
pub(super) struct ThreadCapacity {
    pub(super) applied: Mutex<ContextSettings>,
    pub(super) stops: AtomicU64,
    pub(super) last_start: Mutex<Option<Value>>,
}

type SharedCapacity = Arc<ThreadCapacity>;

#[derive(Default)]
pub(super) struct ContextCapacity(Mutex<HashMap<String, SharedCapacity>>);

impl ContextCapacity {
    pub(super) async fn thread(&self, id: &str) -> SharedCapacity {
        self.0
            .lock()
            .await
            .entry(id.to_owned())
            .or_default()
            .clone()
    }
}

impl Client {
    pub(super) async fn request_with_context(
        &self,
        method: &str,
        mut params: Value,
    ) -> Result<Value> {
        let id = params["threadId"]
            .as_str()
            .ok_or(GuiError::InvalidRequest)?;
        let state = self.context_capacity.thread(id).await;
        // Serialize resume/send for this conversation, including the full rejoin and its acknowledgement.
        let mut applied = state.applied.lock().await;
        let settings = context_settings::for_thread(self.app.clone(), id.to_owned())
            .await
            .map_err(|_| GuiError::ContextSettings)?;
        if *applied != settings && self.reload_context(id, &settings, &applied).await? {
            *applied = settings;
        }
        if method == "thread/resume" {
            context_settings::apply_capacity(&mut params, &applied);
        }
        let continuation = super::context_change::continuation_overrides(&params);
        let result = self.request_raw(method, params).await?;
        if method == "turn/start" {
            *state.last_start.lock().await = Some(continuation);
        }
        Ok(result)
    }

    pub(super) async fn reload_context(
        &self,
        id: &str,
        settings: &ContextSettings,
        previous: &ContextSettings,
    ) -> Result<bool> {
        if self.active_turns.lock().await.contains_key(id) {
            return Ok(false);
        }
        let mut read_params = json!({"threadId": id, "excludeTurns": true});
        crate::codex_gui::home::scope_thread_request("thread/resume", &mut read_params);
        let snapshot = self.request_raw("thread/resume", read_params).await?;
        // The server can start autonomous turns; its status is authoritative even before our event arrives.
        if !idle_snapshot(id, &snapshot)? {
            return Ok(false);
        }
        let mut params = resume_settings(id, &snapshot)?;
        let mut fallback = params.clone();
        context_settings::apply_capacity(&mut fallback, previous);
        context_settings::apply_capacity(&mut params, settings);
        self.request_raw("thread/unsubscribe", json!({"threadId": id}))
            .await?;
        // Rejoining with config explicitly present applies overrides on the supported CLI, including reset.
        // Do not restart the shared process: other conversations and pending approvals must survive.
        if self.request_raw("thread/resume", params).await.is_err() {
            if self.request_raw("thread/resume", fallback).await.is_err() {
                eprintln!("Codex GUI could not restore the previous context settings");
            }
            return Err(GuiError::ContextSettings);
        }
        self.restore_legacy_sandbox(id, &snapshot).await?;
        Ok(true)
    }

    async fn restore_legacy_sandbox(&self, id: &str, snapshot: &Value) -> Result<()> {
        if snapshot
            .pointer("/activePermissionProfile/id")
            .and_then(Value::as_str)
            .is_none()
        {
            self.request_raw(
                "thread/settings/update",
                json!({
                    "threadId": id, "sandboxPolicy": snapshot["sandbox"],
                }),
            )
            .await?;
        }
        Ok(())
    }
}

pub(super) fn idle_snapshot(id: &str, snapshot: &Value) -> Result<bool> {
    if snapshot.pointer("/thread/id").and_then(Value::as_str) != Some(id) {
        return Err(GuiError::ContextSettings);
    }
    match snapshot
        .pointer("/thread/status/type")
        .and_then(Value::as_str)
    {
        Some("idle" | "notLoaded") => Ok(true),
        Some("active") => Ok(false),
        _ => Err(GuiError::ContextSettings),
    }
}

fn resume_settings(id: &str, snapshot: &Value) -> Result<Value> {
    let mut params = json!({"threadId": id, "excludeTurns": true, "config": {}});
    for key in [
        "model",
        "modelProvider",
        "serviceTier",
        "cwd",
        "runtimeWorkspaceRoots",
        "approvalPolicy",
        "approvalsReviewer",
    ] {
        if let Some(value) = snapshot.get(key) {
            params[key] = value.clone();
        }
    }
    if let Some(effort) = snapshot
        .get("reasoningEffort")
        .filter(|value| !value.is_null())
    {
        params["config"]["model_reasoning_effort"] = effort.clone();
    }
    if let Some(profile) = snapshot
        .pointer("/activePermissionProfile/id")
        .and_then(Value::as_str)
    {
        params["permissions"] = profile.into();
    } else {
        // Preserve the complete legacy policy through thread/settings/update after rejoining.
        // Refuse unsupported policy shapes instead of silently widening filesystem access.
        params["sandbox"] = match snapshot.pointer("/sandbox/type").and_then(Value::as_str) {
            Some("readOnly") => "read-only",
            Some("workspaceWrite") => "workspace-write",
            Some("dangerFullAccess") => "danger-full-access",
            _ => return Err(GuiError::ContextSettings),
        }
        .into();
    }
    Ok(params)
}

#[cfg(test)]
#[path = "context_capacity_tests.rs"]
mod tests;
