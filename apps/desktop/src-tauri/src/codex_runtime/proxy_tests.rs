use super::*;
use tiny_http::{Response, Server};

const CHILD_MARKER: &str = "CSW_MODEL_CATALOG_PROXY_TEST";
const TEST_NAME: &str =
    "codex_runtime::proxy_tests::model_refresh_reaches_loopback_with_global_proxy";
const TIMEOUT: Duration = Duration::from_secs(5);

#[test]
fn model_refresh_reaches_loopback_with_global_proxy() {
    if let Ok(url) = std::env::var(CHILD_MARKER) {
        let body = model_catalog_client(TIMEOUT)
            .unwrap()
            .get(url)
            .send()
            .unwrap()
            .error_for_status()
            .unwrap()
            .text()
            .unwrap();
        assert_eq!(body, "local-model-catalog");
        return;
    }
    let direct = Server::http("127.0.0.1:0").unwrap();
    let proxy = Server::http("127.0.0.1:0").unwrap();
    let url = format!("http://{}/v1/models", direct.server_addr());
    let proxy_url = format!("http://{}", proxy.server_addr());
    let server = thread::spawn(move || {
        let request = direct
            .recv_timeout(TIMEOUT)
            .unwrap()
            .expect("local service was not reached");
        assert_eq!(request.url(), "/v1/models");
        request
            .respond(Response::from_string("local-model-catalog"))
            .unwrap();
    });
    let output = isolated_child(&url, &proxy_url).output().unwrap();
    server.join().unwrap();
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        proxy.try_recv().unwrap().is_none(),
        "local model requests must never reach the proxy"
    );
}

fn isolated_child(url: &str, proxy_url: &str) -> std::process::Command {
    let mut command = std::process::Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", TEST_NAME, "--nocapture"])
        .env(CHILD_MARKER, url);
    for key in [
        "HTTP_PROXY",
        "http_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
    ] {
        command.env(key, proxy_url);
    }
    command
        .env("NO_PROXY", "")
        .env("no_proxy", "")
        .env_remove("REQUEST_METHOD");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}
