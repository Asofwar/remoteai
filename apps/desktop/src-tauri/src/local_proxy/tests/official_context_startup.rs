use super::*;
use crate::{
    models::{AppSettings, ManagerStateFile},
    storage,
};
use serde_json::{json, Value};
use std::{fs, future::Future, path::PathBuf, sync::mpsc, task::Poll, thread, time::Duration};
use tauri::Manager;

const PROBE_ENV: &str = "CSW_OFFICIAL_CONTEXT_STARTUP_TEST";
const MODEL: &str = "gpt-6.1-sol";
const TIMEOUT: Duration = Duration::from_secs(5);

struct Fixture {
    app: tauri::App<tauri::test::MockRuntime>,
    root: PathBuf,
    paths: storage::Paths,
}

impl Fixture {
    fn new() -> Self {
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().identifier =
            format!("dev.codex.switch.context-startup.{}", uuid::Uuid::new_v4());
        let app = tauri::test::mock_builder().build(context).unwrap();
        let root = app.path().app_data_dir().unwrap();
        let settings = AppSettings {
            codex_home: Some(root.join("external").to_string_lossy().into_owned()),
            official_model_context_windows: [(MODEL.into(), 500_000)].into(),
            ..Default::default()
        };
        storage::write_app_settings(app.handle(), &settings).unwrap();
        // This fixture only runs in its own process; never replace another test's home selection.
        crate::codex_home::initialize(&settings);
        let paths = storage::resolve_paths(app.handle()).unwrap();
        let fixture = Self { app, root, paths };
        fixture.state(true, None, None);
        fixture.reset_cache();
        storage::write_json_atomic(&fixture.root.join("official-models-cache.json"), &source())
            .unwrap();
        fixture
    }

    fn state(&self, enabled: bool, provider: Option<&str>, group: Option<&str>) {
        storage::write_state(
            &self.paths,
            &ManagerStateFile {
                local_proxy_enabled: enabled,
                active_provider_id: provider.map(str::to_owned),
                active_provider_group: group.map(str::to_owned),
                ..Default::default()
            },
        )
        .unwrap();
    }

    fn reset_cache(&self) {
        storage::write_json_atomic(
            &self.cache_path(),
            &json!({
                "client_version": "0.155.0", "identity": {"type": "fixture"}, "etag": "old",
                "models": [{"slug": "gpt-6-sol", "visibility": "list", "context_window": 272_000}]
            }),
        )
        .unwrap();
    }

    fn cache_path(&self) -> PathBuf {
        self.paths.codex_home.join("models_cache.json")
    }

    fn preferences(&self) -> Vec<Option<Vec<u8>>> {
        ["settings.json", "model-context-settings.json"]
            .iter()
            .map(|name| fs::read(self.root.join(name)).ok())
            .collect()
    }

    fn assert_restored(&self) {
        let cache = storage::read_json(&self.cache_path()).unwrap();
        assert_eq!(cache["models"].as_array().unwrap().len(), 2);
        assert_eq!(cache["models"][0]["visibility"], "list");
        assert_eq!(cache["models"][1]["slug"], MODEL);
        assert_eq!(cache["models"][1]["visibility"], "hide");
        assert_eq!(cache["models"][1]["context_window"], 500_000);
        assert_eq!(cache["models"][1]["max_context_window"], 500_000);
        assert_eq!(cache["models"][1]["auto_compact_token_limit"], Value::Null);
        assert_eq!(cache["client_version"], "0.155.0");
        assert_eq!(cache["identity"], json!({"type": "fixture"}));
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        assert_eq!(
            self.root.file_name().unwrap().to_str().unwrap(),
            self.app.config().identifier
        );
        fs::remove_dir_all(&self.root).unwrap();
    }
}

fn source() -> Value {
    json!({"models": [
        {"slug": MODEL, "visibility": "list", "context_window": 373_000,
            "max_context_window": 872_000, "auto_compact_token_limit": 250_000},
        {"slug": "other-plan-model", "visibility": "list"}
    ]})
}

#[test]
fn startup_rechecks_saved_context_without_resaving_or_expanding_model_selection() {
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "local_proxy::official_context_startup::tests::startup_probe",
            "--nocapture",
        ])
        .env(PROBE_ENV, "1")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn startup_probe() {
    if std::env::var(PROBE_ENV).as_deref() != Ok("1") {
        return;
    }
    for separate_preferences in [false, true] {
        let fixture = Fixture::new();
        if separate_preferences {
            storage::write_json_atomic(
                &fixture.root.join("model-context-settings.json"),
                &json!({
                    "globalContextWindow": 400_000, "modelContextWindows": {MODEL: 500_000}
                }),
            )
            .unwrap();
        }
        let before = fixture.preferences();
        for _ in 0..2 {
            fixture.reset_cache();
            tauri::async_runtime::block_on(restore(fixture.app.handle().clone())).unwrap();
            fixture.assert_restored();
            assert_eq!(fixture.preferences(), before);
        }
        assert_other_targets_are_untouched(&fixture);
    }
    assert_slow_lookup_keeps_polling_responsive();
}

fn assert_other_targets_are_untouched(fixture: &Fixture) {
    for (enabled, provider, group) in [
        (false, None, None),
        (true, Some("provider"), None),
        (true, None, Some("group")),
    ] {
        fixture.reset_cache();
        fixture.state(enabled, provider, group);
        let before = fs::read(fixture.cache_path()).unwrap();
        tauri::async_runtime::block_on(restore(fixture.app.handle().clone())).unwrap();
        assert_eq!(fs::read(fixture.cache_path()).unwrap(), before);
    }
}

fn assert_slow_lookup_keeps_polling_responsive() {
    let fixture = Fixture::new();
    fs::remove_file(fixture.root.join("official-models-cache.json")).unwrap();
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let mut settings = read_app_settings(fixture.app.handle()).unwrap();
    settings.cloud_base_url = Some(format!("http://{}", server.server_addr()));
    storage::write_app_settings(fixture.app.handle(), &settings).unwrap();
    let (received, waiting) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let worker = thread::spawn(move || {
        let request = server.recv_timeout(TIMEOUT).unwrap().unwrap();
        assert_eq!(request.url(), "/official-models");
        received.send(()).unwrap();
        released.recv_timeout(TIMEOUT).unwrap();
        request
            .respond(tiny_http::Response::from_string(source().to_string()))
            .unwrap();
    });
    let task = restore(fixture.app.handle().clone());
    waiting.recv_timeout(TIMEOUT).unwrap();
    tauri::async_runtime::block_on(assert_pending_and_poll(task, &fixture, release));
    worker.join().unwrap();
    fixture.assert_restored();
}

async fn assert_pending_and_poll(
    task: tauri::async_runtime::JoinHandle<()>,
    fixture: &Fixture,
    release: mpsc::Sender<()>,
) {
    use crate::local_proxy::{begin_proxy_session_request, list_proxy_session_requests_blocking};
    let mut task = std::pin::pin!(task);
    assert!(
        std::future::poll_fn(|cx| Poll::Ready(task.as_mut().poll(cx)))
            .await
            .is_pending()
    );
    let id = "startup-context-polling";
    let guard = begin_proxy_session_request(&[("thread-id".into(), id.into())], None, b"{}", None);
    for _ in 0..3 {
        assert_eq!(list_proxy_session_requests_blocking(id).unwrap().len(), 1);
        assert_eq!(
            read_app_settings(fixture.app.handle())
                .unwrap()
                .official_model_context_windows[MODEL],
            500_000
        );
    }
    release.send(()).unwrap();
    task.await.unwrap();
    drop(guard);
}
