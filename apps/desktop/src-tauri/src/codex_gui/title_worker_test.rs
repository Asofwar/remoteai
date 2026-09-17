//! Opt-in protocol smoke test: the real installed CLI talks only to a local fixture server.
use super::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tiny_http::{Header, Response, Server};

fn response_stream() -> String {
    let text = r#"{"title":"熊骑车 SVG 动画"}"#;
    let item = json!({"id": "message-title", "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": text, "annotations": []}]});
    let events = [
        json!({"type": "response.created", "response": {"id": "response-title", "status": "in_progress"}}),
        json!({"type": "response.output_item.added", "output_index": 0, "item": {
            "id": "message-title", "type": "message", "role": "assistant", "content": []}}),
        json!({"type": "response.output_text.delta", "item_id": "message-title",
            "output_index": 0, "content_index": 0, "delta": text}),
        json!({"type": "response.output_item.done", "output_index": 0, "item": item}),
        json!({"type": "response.completed", "response": {"id": "response-title", "status": "completed",
            "output": [item], "usage": {"input_tokens": 20, "output_tokens": 10, "total_tokens": 30}}}),
    ];
    events
        .iter()
        .map(|event| {
            format!(
                "event: {}\ndata: {event}\n\n",
                event["type"].as_str().unwrap()
            )
        })
        .collect()
}

fn serve(server: Server, stop: Arc<AtomicBool>, bodies: Arc<Mutex<Vec<Value>>>) {
    while !stop.load(Ordering::Acquire) {
        let Some(mut request) = server.recv_timeout(Duration::from_millis(100)).unwrap() else {
            continue;
        };
        if request.url().ends_with("/responses") {
            let mut body = String::new();
            request.as_reader().read_to_string(&mut body).unwrap();
            bodies
                .lock()
                .unwrap()
                .push(serde_json::from_str(&body).unwrap());
            request
                .respond(
                    Response::from_string(response_stream()).with_header(
                        Header::from_bytes("Content-Type", "text/event-stream").unwrap(),
                    ),
                )
                .unwrap();
        } else {
            request
                .respond(
                    Response::from_string(r#"{"models":[]}"#).with_header(
                        Header::from_bytes("Content-Type", "application/json").unwrap(),
                    ),
                )
                .unwrap();
        }
    }
}

fn remove_fixture(root: &std::path::Path) {
    // Windows can briefly retain SQLite handles after the CLI process has exited.
    for _ in 0..40 {
        match std::fs::remove_dir_all(root) {
            Ok(()) => return,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
            Err(_) => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    std::fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
#[ignore = "Set CODEX_TITLE_TEST_CLI to an installed Codex binary; uses a local HTTP fixture only"]
async fn real_cli_generates_a_private_title_with_configured_model_and_effort() {
    let binary =
        std::env::var_os("CODEX_TITLE_TEST_CLI").expect("CODEX_TITLE_TEST_CLI is required");
    let root = std::env::temp_dir().join(format!("title-worker-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let server = Server::http("127.0.0.1:0").unwrap();
    let address = server.server_addr();
    std::fs::write(
        root.join("config.toml"),
        format!(
            "model_provider = 'codex-switch-gui'\n[model_providers.codex-switch-gui]\n\
         name = 'Title fixture'\nbase_url = 'http://{address}/v1'\nwire_api = 'responses'\n\
         requires_openai_auth = false\nsupports_websockets = false\n"
        ),
    )
    .unwrap();
    let stop = Arc::new(AtomicBool::new(false));
    let bodies = Arc::new(Mutex::new(Vec::new()));
    let worker = {
        let stop = stop.clone();
        let bodies = bodies.clone();
        std::thread::spawn(move || serve(server, stop, bodies))
    };
    let request = serde_json::from_value(
        json!({"threadId": "original", "prompt": "生成一个熊骑车的 SVG 动画",
        "settings": {"model": "gpt-5.6-luna", "effort": "low"}}),
    )
    .unwrap();
    let result = generate(
        Executable {
            path: binary.into(),
            version: "0.154.0".into(),
        },
        root.clone(),
        &request,
    )
    .await;
    stop.store(true, Ordering::Release);
    worker.join().unwrap();
    remove_fixture(&root);
    assert_eq!(result.unwrap(), "熊骑车 SVG 动画");
    let bodies = bodies.lock().unwrap();
    let body = bodies.first().expect("the CLI must contact the fixture");
    assert_eq!(body["model"], "gpt-5.6-luna");
    assert_eq!(body["reasoning"]["effort"], "low");
    assert_eq!(body["text"]["format"]["type"], "json_schema");
    assert!(body["tools"].as_array().is_none_or(Vec::is_empty));
}
