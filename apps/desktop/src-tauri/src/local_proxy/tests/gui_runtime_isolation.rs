const GUI_RUNTIME_TEST_NAME: &str = "CSW_GUI_RUNTIME_TEST_NAME";
const GUI_RUNTIME_TEST_APP_ID: &str = "CSW_GUI_RUNTIME_TEST_APP_ID";

// Returns true in the parent after running this test in a fresh process. The history store
// lives for the process lifetime, so a mutex cannot isolate it or release its SQLite files.
fn run_gui_runtime_test_in_subprocess() -> bool {
    let current = thread::current();
    let name = current.name().unwrap();
    if std::env::var(GUI_RUNTIME_TEST_NAME).as_deref() == Ok(name) {
        return false;
    }
    let app = breakdown_responsiveness_test_app();
    let root = app.path().app_data_dir().unwrap();
    let identifier = app.config().identifier.clone();
    assert!(identifier.starts_with("com.codex-switch.breakdown-test."));
    assert!(root.is_absolute());
    assert_eq!(root.file_name().unwrap().to_str().unwrap(), identifier);
    drop(app);
    let result = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", name, "--nocapture"])
        .env(GUI_RUNTIME_TEST_NAME, name)
        .env(GUI_RUNTIME_TEST_APP_ID, identifier)
        .env("CODEX_HOME", root.join("external-codex"))
        .output()
        .unwrap();
    // Only the parent removes the directory, after every database handle has been closed.
    if root.exists() {
        fs::remove_dir_all(&root).unwrap();
    }
    assert!(
        result.status.success(),
        "{name}\n{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
    true
}

fn gui_runtime_test_app() -> tauri::App<tauri::test::MockRuntime> {
    let identifier = std::env::var(GUI_RUNTIME_TEST_APP_ID)
        .expect("GUI runtime fixtures must run in an isolated subprocess");
    assert!(identifier.starts_with("com.codex-switch.breakdown-test."));
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().identifier = identifier;
    tauri::test::mock_builder().build(context).unwrap()
}
