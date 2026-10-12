use super::*;
use std::time::Duration;

#[derive(Default)]
struct Screenshots {
    calls: Vec<String>,
}

impl Executor for Screenshots {
    async fn call(&mut self, name: &str, arguments: Value) -> Result<Value> {
        self.calls.push(name.into());
        assert_eq!(arguments["app"], "Remote AI");
        Ok(json!({"content": [
            {"type": "text", "text": "Account settings are visible"},
            {"type": "image", "mimeType": "image/png", "data": "aW1hZ2U="}
        ]}))
    }
}

fn action(id: &str) -> Value {
    json!({"type": "function_call", "call_id": id, "name": "get_window_state",
        "arguments": "{\"app\":\"Remote AI\"}"})
}

#[tokio::test]
async fn tool_round_trip_preserves_reasoning_call_ids_and_screenshots() {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let url = format!("http://{}", server.server_addr().to_ip().unwrap());
    let worker = std::thread::spawn(move || {
        let request = server
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        request.respond(tiny_http::Response::from_string(json!({"status": "completed", "output": [
            {"type": "reasoning", "id": "reason", "encrypted_content": "opaque"}, action("inspect")
        ]}).to_string())).unwrap();
        let mut continuation = server
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        let body: Value = serde_json::from_reader(continuation.as_reader()).unwrap();
        assert_eq!(body["input"][0]["encrypted_content"], "opaque");
        assert_eq!(body["input"][1]["call_id"], "inspect");
        assert_eq!(body["input"][2]["type"], "function_call_output");
        assert_eq!(body["input"][2]["call_id"], "inspect");
        assert_eq!(
            body["input"][2]["output"][1]["image_url"],
            "data:image/png;base64,aW1hZ2U="
        );
        continuation.respond(tiny_http::Response::from_string(json!({"status": "completed", "output": [
            {"type": "message", "content": [{"type": "output_text", "text": "已查看账户设置。"}]}
        ]}).to_string())).unwrap();
    });
    let conversation = Conversation {
        base_url: &url,
        revision: 7,
        body: json!({"input": [], "store": false}),
    };
    let mut screenshots = Screenshots::default();
    assert_eq!(
        answer(conversation, &mut screenshots, &mut |_| {})
            .await
            .unwrap(),
        "已查看账户设置。"
    );
    assert_eq!(screenshots.calls, vec!["get_window_state"]);
    worker.join().unwrap();
}

#[tokio::test]
async fn tool_budget_returns_a_paired_error_without_executing_more_actions() {
    let mut screenshots = Screenshots::default();
    let output = perform(&mut screenshots, &action("limit"), MAX_TOOL_CALLS + 1)
        .await
        .unwrap();
    assert_eq!(output["call_id"], "limit");
    assert!(output.to_string().contains("Action limit reached"));
    assert!(screenshots.calls.is_empty());
}

#[tokio::test]
async fn malformed_tool_calls_never_reach_the_executor() {
    let mut screenshots = Screenshots::default();
    let mut malformed = action("");
    assert!(perform(&mut screenshots, &malformed, 1).await.is_err());
    malformed["call_id"] = json!("valid");
    malformed["arguments"] = json!("not-json");
    assert!(perform(&mut screenshots, &malformed, 1).await.is_err());
    assert!(screenshots.calls.is_empty());
}
