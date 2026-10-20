#[test]
fn git_message_requests_pin_gui_account_and_preserve_the_generation_instructions() {
    if run_gui_runtime_test_in_subprocess() { return; }
    use crate::codex_config::{GIT_MESSAGE_REQUEST_PURPOSE, HELP_ACCOUNT_REVISION_HEADER,
        LOCAL_PROXY_REQUEST_PURPOSE_HEADER};
    let _guard = GUI_SPEED_TEST_LOCK.lock().unwrap();
    let upstream = Server::http("127.0.0.1:0").unwrap();
    let fixture = GuiRuntimeFixture::new(&upstream);
    let selection = crate::codex_gui::account_selection::snapshot(fixture.app.handle()).unwrap();
    let paths = resolve_paths(fixture.app.handle()).unwrap();
    write_state(&paths, &ManagerStateFile::default()).unwrap();
    let prompt_path = fixture.app.path().app_data_dir().unwrap().join("codex-gui-system-prompts.json");
    crate::storage::write_json_atomic(&prompt_path, &json!({
        "injectionEnabled": true, "injectionPrompts": ["unrelated prompt"],
        "filterEnabled": true, "filterRules": ["Commit instructions"]
    })).unwrap();
    let worker = thread::spawn(move || {
        let mut request = upstream.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
        let body: Value = serde_json::from_reader(request.as_reader()).unwrap();
        assert_eq!(body["instructions"], "Commit instructions");
        assert_eq!(body["input"], "selected diff");
        assert!(!body.to_string().contains("unrelated prompt"));
        runtime_upstream_reply(request, "default");
        assert!(upstream.recv_timeout(Duration::from_millis(500)).unwrap().is_none());
    });
    let send = |revision: u64| gui_runtime_client().post(format!("{}/responses", fixture.base_url))
        .bearer_auth(crate::codex_config::LOCAL_PROXY_TOKEN)
        .header(LOCAL_PROXY_REQUEST_PURPOSE_HEADER, GIT_MESSAGE_REQUEST_PURPOSE)
        .header(HELP_ACCOUNT_REVISION_HEADER, revision.to_string())
        .json(&json!({"model": "gpt-5.6-sol", "input": "selected diff", "stream": false,
            "instructions": "Commit instructions"})).send().unwrap();
    assert!(send(selection.revision).status().is_success());
    assert!(!send(selection.revision + 1).status().is_success());
    worker.join().unwrap();
}
