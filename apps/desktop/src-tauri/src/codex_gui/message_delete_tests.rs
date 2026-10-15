use super::*;

fn target() -> EditRequest {
    serde_json::from_value(
        json!({"threadId": "thread", "turnId": "last", "itemId": "user",
        "text": "", "access": "read-only"}),
    )
    .unwrap()
}

fn history() -> Value {
    json!({"id": "thread", "status": {"type": "idle"}, "turns": [
        {"id": "first", "status": "completed", "items": [
            {"id": "earlier", "type": "userMessage", "content": [{"type": "text", "text": "earlier"}]}]},
        {"id": "last", "status": "completed", "items": [
            {"id": "user", "type": "userMessage", "content": [{"type": "text", "text": "last"}]},
            {"id": "reply", "type": "agentMessage", "text": "reply"}]},
        {"id": "continuation", "status": "completed", "items": []}
    ]})
}

#[tokio::test]
async fn delete_removes_message_and_suffix_without_starting_a_turn() {
    for paginated in [false, true] {
        let mut source = history();
        if paginated {
            source["historyMode"] = json!("paginated");
        }
        let result = delete_message(&target(), |method, params| {
            std::future::ready(Ok(match method {
                "thread/resume" | "thread/read" => json!({"thread": source}),
                "thread/rollback" => {
                    assert!(!paginated);
                    assert_eq!(params, json!({"threadId": "thread", "numTurns": 2}));
                    json!({"thread": {"id": "thread", "turns": [source["turns"][0]]}})
                }
                "thread/revert" => {
                    assert!(paginated);
                    assert_eq!(
                        params,
                        json!({"threadId": "thread", "beforeTurnId": "last"})
                    );
                    json!({"thread": {"id": "thread"}})
                }
                _ => panic!("deletion must not send a message: {method}"),
            }))
        })
        .await
        .unwrap();
        assert_eq!(result["thread"]["turns"], json!([source["turns"][0]]));
        assert!(result.get("turn").is_none());
    }
}

#[tokio::test]
async fn deleting_first_message_keeps_an_empty_conversation() {
    let mut source = history();
    source["turns"].as_array_mut().unwrap().remove(0);
    source["historyMode"] = json!("paginated");
    let result = delete_message(&target(), |method, _| {
        std::future::ready(Ok(match method {
            "thread/resume" | "thread/read" => json!({"thread": source}),
            "thread/revert" => json!({"thread": {"id": "thread"}}),
            _ => panic!("unexpected request: {method}"),
        }))
    })
    .await
    .unwrap();
    assert_eq!(result["thread"], json!({"id": "thread", "turns": []}));
}

#[tokio::test]
async fn deletion_rejects_stale_active_and_mid_turn_targets_before_rewind() {
    let mut stale = history();
    stale["turns"][1]["items"][0]["id"] = json!("newer");
    let mut active = history();
    active["status"]["type"] = json!("active");
    let mut steering = history();
    steering["turns"][1]["items"].as_array_mut().unwrap().insert(0,
        json!({"id": "before", "type": "userMessage", "content": [{"type": "text", "text": "keep"}]}));
    for source in [stale, active, steering] {
        let result = delete_message(&target(), |method, _| {
            assert!(matches!(method, "thread/resume" | "thread/read"));
            std::future::ready(Ok(json!({"thread": source})))
        })
        .await;
        assert!(result.is_err());
    }
}
