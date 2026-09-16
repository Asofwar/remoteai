use super::protocol::GuiRequest;
use serde_json::json;

#[test]
fn fork_keeps_the_requested_terminal_prefix_and_defers_goals() {
    let request: GuiRequest = serde_json::from_value(json!({
        "operation": "fork", "threadId": "source", "turnId": "answer",
        "access": "read-only"
    }))
    .unwrap();
    let (method, params) = request.into_rpc().unwrap();
    assert_eq!(method, "thread/fork");
    assert_eq!(params["threadId"], "source");
    assert_eq!(params["lastTurnId"], "answer");
    assert_eq!(params["deferGoalContinuation"], true);
    assert_eq!(params["sandbox"], "read-only");
    assert!(params.get("cwd").is_none());
}

#[test]
fn fork_rejects_invalid_boundaries_and_directories() {
    for (key, value) in [
        ("threadId", "../source"),
        ("turnId", ""),
        ("turnId", "turn\n1"),
        ("cwd", "relative/path"),
    ] {
        let mut body = json!({"operation": "fork", "threadId": "source", "turnId": "answer",
            "access": "workspace-write"});
        body[key] = json!(value);
        let request: GuiRequest = serde_json::from_value(body).unwrap();
        assert!(request.into_rpc().is_err(), "{key}: {value}");
    }
}
