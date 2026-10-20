use super::{changes, patch, tests::Repo};
use crate::codex_gui::{execute_request, protocol::GuiRequest, GuiState};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;
use std::io::{Read, Seek};

#[tokio::test]
async fn patch_downloads_work_without_chat_and_reopen_with_stable_revisions() {
    let repo = Repo::new(true);
    let state = GuiState::default();
    let hash = changes::head(&repo.0).unwrap();
    let transfer = uuid::Uuid::new_v4().to_string();
    let request = || {
        serde_json::from_value::<GuiRequest>(json!({ "operation": "downloadOpen",
        "scope": "project", "cwd": repo.0, "path": "unused.patch", "gitCommit": hash,
        "transferId": transfer, "maxBytes": 1024 * 1024 }))
        .unwrap()
    };
    let first = execute_request(&state, request()).await.unwrap().data;
    let second = execute_request(&state, request()).await.unwrap().data;
    assert_eq!(first["revision"], second["revision"]);
    assert_ne!(first["id"], second["id"]);
    assert_eq!(first["name"], format!("{}.patch", &hash[..12]));
    let read = |owner: &str| {
        serde_json::from_value::<GuiRequest>(json!({ "operation": "fileRead",
        "threadId": owner, "id": first["id"], "offset": 0, "length": 256 * 1024,
        "maxBytes": 1024 * 1024 }))
        .unwrap()
    };
    assert!(execute_request(&state, read("another-transfer"))
        .await
        .is_err());
    let chunk = execute_request(&state, read(&transfer)).await.unwrap().data;
    let bytes = STANDARD.decode(chunk["data"].as_str().unwrap()).unwrap();
    assert_eq!(bytes.len() as u64, first["size"].as_u64().unwrap());
    assert!(String::from_utf8(bytes).unwrap().contains("+one"));
    let close = serde_json::from_value(json!({ "operation": "fileClose", "threadId": transfer,
        "id": first["id"] }))
    .unwrap();
    execute_request(&state, close).await.unwrap();
    assert!(execute_request(&state, read(&transfer)).await.is_err());
}

#[test]
fn merge_patch_contains_first_parent_changes_and_rejects_non_commit_objects() {
    let repo = Repo::new(true);
    repo.git(&["switch", "-c", "feature"]);
    repo.write("feature.txt", "feature\n");
    repo.git(&["add", "."]);
    repo.git(&["commit", "-m", "feature"]);
    repo.git(&["switch", "main"]);
    repo.write("one.txt", "main\n");
    repo.git(&["commit", "-am", "main"]);
    repo.git(&["merge", "--no-ff", "feature", "-m", "merge"]);
    let hash = changes::head(&repo.0).unwrap();
    let mut patch = patch::create(repo.0.to_str().unwrap(), &hash, 1024 * 1024).unwrap();
    patch.rewind().unwrap();
    let mut text = String::new();
    patch.read_to_string(&mut text).unwrap();
    assert!(text.contains("+feature"));
    assert!(!text.contains("+main"));
    let blob = super::super::output(&repo.0, &["rev-parse", "HEAD:one.txt"]).unwrap();
    assert!(patch::create(repo.0.to_str().unwrap(), &blob, 1024).is_err());
}
