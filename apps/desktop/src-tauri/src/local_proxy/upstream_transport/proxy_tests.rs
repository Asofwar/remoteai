use super::*;
use std::{process::Command, thread};
use tiny_http::{Header, Response, Server, StatusCode};

const CHILD_MARKER: &str = "CSW_PROXY_FORWARDING_FIXTURE";
const TEST_NAME: &str = concat!(
    "local_proxy::upstream_transport::proxy_tests::",
    "forwarding_uses_environment_proxy_and_bypasses_it_after_redirect"
);

#[test]
fn forwarding_uses_environment_proxy_and_bypasses_it_after_redirect() {
    if std::env::var_os(CHILD_MARKER).is_some() {
        let builder = reqwest::blocking::Client::new()
            .get("http://destination.invalid/v1/responses?test=1")
            .bearer_auth("fixture-credential");
        let request = Request::prepare(builder).unwrap();
        assert_eq!(request.send().unwrap().bytes().unwrap(), b"forwarded");
        return;
    }
    let proxy = Server::http("127.0.0.1:0").unwrap();
    let direct = Server::http("127.0.0.1:0").unwrap();
    let proxy_url = format!("http://{}", proxy.server_addr());
    let worker = thread::spawn(move || serve_redirect(proxy, direct));
    // Child-local environment settings exercise the production path without racing other tests.
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", TEST_NAME, "--nocapture"])
        .env(CHILD_MARKER, "1")
        .env("HTTP_PROXY", &proxy_url)
        .env("http_proxy", &proxy_url)
        .env("NO_PROXY", "")
        .env("no_proxy", "")
        .env_remove("REQUEST_METHOD")
        .output()
        .unwrap();
    worker.join().unwrap();
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn serve_redirect(proxy: Server, direct: Server) {
    let timeout = Duration::from_secs(10);
    let first = proxy
        .recv_timeout(timeout)
        .unwrap()
        .expect("proxy must receive the request");
    assert!(first.url().ends_with("/v1/responses?test=1"));
    assert!(first
        .headers()
        .iter()
        .any(|header| header.field.equiv("Authorization")));
    first
        .respond(
            Response::empty(StatusCode(302)).with_header(
                Header::from_bytes("Location", format!("http://{}/final", direct.server_addr()))
                    .unwrap(),
            ),
        )
        .unwrap();
    let redirected = direct
        .recv_timeout(timeout)
        .unwrap()
        .expect("loopback must connect directly");
    assert_eq!(redirected.url(), "/final");
    assert!(!redirected
        .headers()
        .iter()
        .any(|header| header.field.equiv("Authorization")));
    redirected
        .respond(Response::from_string("forwarded"))
        .unwrap();
}
