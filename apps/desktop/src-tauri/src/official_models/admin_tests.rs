use super::read_admin_model_names;
use std::{fs, future::Future, sync::mpsc, task::Poll, thread, time::Duration};
use tauri::Manager;

const TEST_TIMEOUT: Duration = Duration::from_secs(5);

struct TestApp(tauri::App<tauri::test::MockRuntime>);

impl TestApp {
    fn new(base_url: String) -> Self {
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().identifier =
            format!("dev.codex.switch.admin-model-test.{}", uuid::Uuid::new_v4());
        let app = tauri::test::mock_builder().build(context).unwrap();
        let settings = crate::models::AppSettings {
            cloud_base_url: Some(base_url),
            ..Default::default()
        };
        crate::storage::write_app_settings(app.handle(), &settings).unwrap();
        Self(app)
    }
}

impl Drop for TestApp {
    fn drop(&mut self) {
        let directory = self.0.path().app_data_dir().unwrap();
        assert_eq!(
            directory.file_name().unwrap().to_str().unwrap(),
            self.0.config().identifier
        );
        fs::remove_dir_all(directory).unwrap();
    }
}

fn server(body: &'static str, status: u16) -> (String, mpsc::Sender<()>, thread::JoinHandle<()>) {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let base_url = format!("http://{}", server.server_addr());
    let (release, waiting) = mpsc::channel();
    let worker = thread::spawn(move || {
        let request = server.recv_timeout(TEST_TIMEOUT).unwrap().unwrap();
        assert_eq!(request.url(), "/official-models");
        assert!(!request
            .headers()
            .iter()
            .any(|h| h.field.equiv("Authorization")));
        waiting.recv_timeout(TEST_TIMEOUT).unwrap();
        request
            .respond(tiny_http::Response::from_string(body).with_status_code(status))
            .unwrap();
    });
    (base_url, release, worker)
}

#[test]
fn admin_suggestions_yield_during_network_io_and_need_no_account() {
    let (url, release, worker) = server(
        r#"{"models":[{"slug":"gpt-6.1-sol"},{"slug":"hidden","visibility":"hide"},
            {"id":"admin-only-model"}]}"#,
        200,
    );
    let app = TestApp::new(url);
    let (yielded, models) = tauri::async_runtime::block_on(async {
        let mut command = std::pin::pin!(read_admin_model_names(app.0.handle().clone()));
        let initial =
            std::future::poll_fn(|context| Poll::Ready(command.as_mut().poll(context))).await;
        release.send(()).unwrap();
        let yielded = initial.is_pending();
        let result = match initial {
            Poll::Pending => command.await,
            Poll::Ready(result) => result,
        };
        (yielded, result)
    });
    worker.join().unwrap();
    assert!(
        yielded,
        "model discovery must not block the invoking thread"
    );
    assert_eq!(models.unwrap(), ["gpt-6.1-sol", "admin-only-model"]);
}

#[test]
fn admin_suggestion_failures_expose_no_server_details_or_local_presets() {
    let (url, release, worker) = server("private server error", 503);
    let app = TestApp::new(url);
    release.send(()).unwrap();
    let result = tauri::async_runtime::block_on(read_admin_model_names(app.0.handle().clone()));
    worker.join().unwrap();
    assert_eq!(
        result.unwrap_err(),
        "Could not load the model list. Please try again."
    );
}
