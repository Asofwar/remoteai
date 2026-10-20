use super::{changes, message_context, message_transport, tests::Repo, GitError, SelectedFile};
use serde_json::json;
use std::fs;

fn selected(repo: &Repo, paths: &[&str]) -> (Option<String>, Vec<SelectedFile>) {
    let state = changes::read(&repo.0).unwrap();
    let files = state
        .files
        .into_iter()
        .filter(|file| paths.contains(&file.path.as_str()))
        .map(|file| SelectedFile {
            path: file.path,
            version: file.version,
        })
        .collect();
    (state.head, files)
}

#[test]
fn message_context_contains_only_selected_final_changes_and_preserves_index() {
    let repo = Repo::new(true);
    repo.write("one.txt", "staged intermediate\n");
    repo.git(&["add", "one.txt"]);
    repo.write("one.txt", "selected final\n");
    repo.write("two.txt", "unselected secret\n");
    repo.git(&["add", "two.txt"]);
    repo.write("新 [1].txt", "selected new file\n");
    let index_before = fs::read(repo.0.join(".git/index")).unwrap();
    let (head, files) = selected(&repo, &["one.txt", "新 [1].txt"]);
    let context = message_context::collect(&repo.0, head.as_deref(), &files).unwrap();
    assert!(context.contains("selected final"));
    assert!(context.contains("selected new file"));
    assert!(!context.contains("staged intermediate"));
    assert!(!context.contains("two.txt"));
    assert!(!context.contains("unselected secret"));
    assert_eq!(fs::read(repo.0.join(".git/index")).unwrap(), index_before);
    assert!(!repo.0.join(".git/index.lock").exists());
}

#[test]
fn message_context_handles_initial_commit_staged_deletions_renames_and_binary_files() {
    let repo = Repo::new(false);
    repo.write("initial.txt", "new initial content\n");
    let (head, files) = selected(&repo, &["initial.txt"]);
    assert!(message_context::collect(&repo.0, head.as_deref(), &files)
        .unwrap()
        .contains("new initial content"));
    repo.git(&["add", "."]);
    repo.git(&["commit", "-m", "initial"]);
    repo.git(&["mv", "initial.txt", "renamed.txt"]);
    let (head, files) = selected(&repo, &["renamed.txt"]);
    let context = message_context::collect(&repo.0, head.as_deref(), &files).unwrap();
    assert!(context.contains("rename from initial.txt"));
    assert!(context.contains("rename to renamed.txt"));
    repo.git(&["commit", "-m", "rename"]);
    repo.git(&["rm", "renamed.txt"]);
    fs::write(repo.0.join("binary.bin"), [0, 1, 2, 3]).unwrap();
    let (head, files) = selected(&repo, &["renamed.txt", "binary.bin"]);
    let context = message_context::collect(&repo.0, head.as_deref(), &files).unwrap();
    assert!(context.contains("deleted file mode"));
    assert!(context.contains("Binary files"));
}

#[test]
fn message_context_rejects_stale_or_empty_selection_and_reports_truncation() {
    let repo = Repo::new(true);
    repo.write("one.txt", "selected\n");
    let (head, files) = selected(&repo, &["one.txt"]);
    assert!(matches!(
        message_context::collect(&repo.0, head.as_deref(), &[]),
        Err(GitError::Selection)
    ));
    assert!(matches!(
        message_context::collect(&repo.0, None, &files),
        Err(GitError::Changed)
    ));
    repo.write("one.txt", &"long changed line\n".repeat(10_000));
    assert!(matches!(
        message_context::collect(&repo.0, head.as_deref(), &files),
        Err(GitError::Changed)
    ));
    let (head, files) = selected(&repo, &["one.txt"]);
    let context = message_context::collect(&repo.0, head.as_deref(), &files).unwrap();
    assert!(
        serde_json::from_str::<serde_json::Value>(&context).unwrap()["diffTruncated"]
            .as_bool()
            .unwrap()
    );
}

fn response(text: &str) -> serde_json::Value {
    json!({"status": "completed", "output": [{"type": "message", "content": [
        {"type": "output_text", "text": text}]}]})
}

#[tokio::test]
async fn message_transport_sends_the_account_revision_and_waits_for_completion() {
    use crate::codex_config::{
        GIT_MESSAGE_REQUEST_PURPOSE, HELP_ACCOUNT_REVISION_HEADER,
        LOCAL_PROXY_REQUEST_PURPOSE_HEADER,
    };
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let base = format!("http://{}", server.server_addr());
    let worker = std::thread::spawn(move || {
        let mut request = server
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap()
            .unwrap();
        assert_eq!(request.url(), "/responses");
        let header = |name: &str| {
            request
                .headers()
                .iter()
                .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
                .unwrap()
                .value
                .as_str()
        };
        assert_eq!(
            header(LOCAL_PROXY_REQUEST_PURPOSE_HEADER),
            GIT_MESSAGE_REQUEST_PURPOSE
        );
        assert_eq!(header(HELP_ACCOUNT_REVISION_HEADER), "7");
        let body: serde_json::Value = serde_json::from_reader(request.as_reader()).unwrap();
        assert_eq!(body["input"], "selected diff");
        let event =
            json!({"type": "response.completed", "response": response("fix: selected change")});
        request
            .respond(tiny_http::Response::from_string(format!(
                "data: {event}\n\n"
            )))
            .unwrap();
    });
    let message = message_transport::generate(&base, json!({"input": "selected diff"}), 7)
        .await
        .unwrap();
    assert_eq!(message, "fix: selected change");
    worker.join().unwrap();
}

#[test]
fn message_requires_completed_nonempty_plain_text_from_json_or_stream() {
    let value = response("feat: 更新所选文件\n\n保留其他改动");
    let stream = format!(
        "data: {}\n\ndata: [DONE]\n\n",
        json!({"type": "response.completed", "response": value})
    );
    assert_eq!(
        message_transport::parse_response(stream.as_bytes()).unwrap(),
        "feat: 更新所选文件\n\n保留其他改动"
    );
    assert!(message_transport::parse_response(&serde_json::to_vec(&value).unwrap()).is_ok());
    for text in ["", "```fix: wrapped```", "bad\0message", &"x".repeat(4001)] {
        assert!(
            message_transport::parse_response(&serde_json::to_vec(&response(text)).unwrap())
                .is_err()
        );
    }
    for bytes in [
        b"data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n".as_slice(),
        b"data: {\"type\":\"response.failed\"}\n",
        b"{}",
    ] {
        assert!(message_transport::parse_response(bytes).is_err());
    }
}
