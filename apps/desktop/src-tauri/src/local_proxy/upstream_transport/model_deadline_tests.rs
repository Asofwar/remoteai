use super::*;
use crate::local_proxy::model_catalog_deadline;

#[test]
fn discovery_requests_keep_the_deadline_and_do_not_retry_transport_timeouts() {
    let deadline = Instant::now() + Duration::from_secs(1);
    let request = {
        let _scope = model_catalog_deadline::Scope::until(deadline);
        Request::prepare(reqwest::blocking::Client::new().get("http://127.0.0.1/models")).unwrap()
    };
    assert_eq!(request.deadline, Some(deadline));
    let error = Error::Timeout {
        phase: Phase::ResponseHeaders,
        sent_bytes: 0,
    };
    assert!(!request.can_retry(&error));
    let chat =
        Request::prepare(reqwest::blocking::Client::new().post("http://127.0.0.1/responses"))
            .unwrap();
    assert!(chat.deadline.is_none());
    assert!(chat.can_retry(&error));
}

#[test]
fn an_expired_catalog_budget_never_starts_another_connection() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let _scope = model_catalog_deadline::Scope::until(Instant::now());
    let request = Request::prepare(
        reqwest::blocking::Client::new()
            .get(format!("http://{}/models", listener.local_addr().unwrap())),
    )
    .unwrap();
    assert!(matches!(request.send(), Err(Error::Timeout { .. })));
    assert_eq!(
        listener.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
}
