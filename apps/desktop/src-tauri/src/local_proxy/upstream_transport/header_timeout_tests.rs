use super::*;
use crate::{local_proxy::response_header_timeout, models::ResponseHeaderTimeoutSettings};

#[test]
fn prepared_request_keeps_header_setting_independent_of_worker_and_other_timeouts() {
    let request = {
        let _scope = response_header_timeout::RequestScope::enter(ResponseHeaderTimeoutSettings {
            timeout_seconds: 900,
        });
        let builder = reqwest::blocking::Client::new().post("http://127.0.0.1/responses");
        Request::prepare(builder).unwrap()
    };
    assert_eq!(request.timeouts.response_headers, Duration::from_secs(900));
    assert_eq!(response_header_timeout::current(), Duration::from_secs(600));
    assert_eq!(request.timeouts.upload_idle, Duration::from_secs(120));
    assert_eq!(request.timeouts.response_idle, Duration::from_secs(120));
    assert_eq!(
        request.timeouts.sse_response_idle,
        Some(Duration::from_secs(120))
    );
    assert_eq!(
        thread::spawn(response_header_timeout::current)
            .join()
            .unwrap(),
        Duration::from_secs(600)
    );
}

#[test]
fn longer_header_wait_allows_a_slow_upstream_response() {
    let (url, server) = echo_server(IDLE * 2);
    let mut request = prepared_request(url, b"slow upstream".to_vec());
    request.timeouts.response_headers = IDLE * 4;
    assert_eq!(request.send().unwrap().bytes().unwrap(), b"ok");
    assert_eq!(server.join().unwrap(), b"slow upstream");
}

#[test]
fn configured_header_deadline_expires_even_with_longer_body_timeout() {
    let (url, server) = echo_server(IDLE * 2);
    let mut request = prepared_request(url, b"one request only".to_vec());
    request.timeouts.response_idle = IDLE * 4;
    request.timeouts.sse_response_idle = None;
    let error = match request.send() {
        Ok(_) => panic!("header deadline was not enforced"),
        Err(error) => error,
    };
    assert!(matches!(
        error,
        Error::Timeout {
            phase: Phase::ResponseHeaders,
            ..
        }
    ));
    assert!(!error.can_retry());
    assert_eq!(server.join().unwrap(), b"one request only");
}

#[test]
fn session_polling_remains_responsive_while_waiting_for_response_headers() {
    use crate::local_proxy as proxy;
    let session_id = format!("headers-polling-{}", uuid::Uuid::new_v4());
    let headers = vec![("thread-id".to_string(), session_id.clone())];
    let guard = proxy::begin_proxy_session_request(&headers, None, br#"{"input":"hello"}"#, None);
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let url = format!("http://{}/responses", server.server_addr());
    let reader = thread::spawn(move || {
        let request =
            Request::prepare(reqwest::blocking::Client::new().post(url).body("hello")).unwrap();
        request.send().unwrap().bytes().unwrap()
    });
    let request = server
        .recv_timeout(Duration::from_secs(5))
        .unwrap()
        .unwrap();
    let active = proxy::active_proxy_session_ids()
        .unwrap()
        .contains(&session_id);
    let requests = proxy::list_proxy_session_requests_blocking(&session_id).unwrap();
    let still_waiting = !reader.is_finished();
    request
        .respond(tiny_http::Response::from_string("ok"))
        .unwrap();
    assert_eq!(reader.join().unwrap(), b"ok");
    drop(guard);
    proxy::proxy_sessions().lock().unwrap().remove(&session_id);
    assert!(active && still_waiting);
    assert_eq!(requests.len(), 1);
    assert!(requests[0].response_time_ms.is_none());
}
