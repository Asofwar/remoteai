use super::*;

fn snapshot() -> Value {
    json!({"thread": {"id": "one", "status": {"type": "idle"}},
        "model": "selected-model", "modelProvider": "gui", "serviceTier": "fast",
        "cwd": "/project", "runtimeWorkspaceRoots": ["/project", "/extra"],
        "approvalPolicy": "on-request", "approvalsReviewer": "auto_review",
        "reasoningEffort": "high", "activePermissionProfile": {"id": "custom-profile"},
        "sandbox": {"type": "workspaceWrite", "networkAccess": false}})
}

#[test]
fn reload_retains_model_permissions_and_workspace_without_copying_history() {
    let snapshot = snapshot();
    let params = resume_settings("one", &snapshot).unwrap();
    assert_eq!(params["model"], "selected-model");
    assert_eq!(params["modelProvider"], "gui");
    assert_eq!(params["serviceTier"], "fast");
    assert_eq!(
        params["runtimeWorkspaceRoots"],
        snapshot["runtimeWorkspaceRoots"]
    );
    assert_eq!(params["approvalPolicy"], "on-request");
    assert_eq!(params["approvalsReviewer"], "auto_review");
    assert_eq!(params["permissions"], "custom-profile");
    assert_eq!(params["config"]["model_reasoning_effort"], "high");
    assert_eq!(params["excludeTurns"], true);
    assert!(params.get("sandbox").is_none());
    assert!(params.get("history").is_none());
}

#[test]
fn active_or_unrecognized_threads_are_never_detached() {
    let mut response = snapshot();
    assert!(idle_snapshot("one", &response).unwrap());
    response["thread"]["status"]["type"] = "active".into();
    assert!(!idle_snapshot("one", &response).unwrap());
    response["thread"]["status"]["type"] = "unknown".into();
    assert!(idle_snapshot("one", &response).is_err());
    assert!(idle_snapshot("different", &snapshot()).is_err());
    assert!(idle_snapshot("one", &json!({})).is_err());
}

#[test]
fn legacy_policy_is_not_silently_replaced_by_a_wider_mode() {
    let mut response = snapshot();
    response["activePermissionProfile"] = Value::Null;
    assert_eq!(
        resume_settings("one", &response).unwrap()["sandbox"],
        "workspace-write"
    );
    response["sandbox"]["type"] = "externalSandbox".into();
    assert!(resume_settings("one", &response).is_err());
}

#[tokio::test]
async fn each_thread_has_its_own_serialization_guard() {
    let state = ContextCapacity::default();
    let first = state.thread("one").await;
    let same = state.thread("one").await;
    let other = state.thread("two").await;
    let _guard = first.lock().await;
    assert!(same.try_lock().is_err());
    assert!(other.try_lock().is_ok());
}
