use super::*;
use crate::local_proxy::{model_catalog_deadline, send_with_timeout_retries, stream_response};
use std::{io::Write, net::TcpListener, time::Instant};

const TEST_DEADLINE: Duration = Duration::from_millis(300);

fn slow_official(body_stalls: bool) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/models", listener.local_addr().unwrap());
    let task = thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut headers = Vec::new();
        while !headers.ends_with(b"\r\n\r\n") {
            let mut byte = [0];
            socket.read_exact(&mut byte).unwrap();
            headers.extend(byte);
        }
        if !body_stalls {
            thread::sleep(TEST_DEADLINE * 2);
            return;
        }
        socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n")
            .unwrap();
        // A trickle must not extend the catalog's overall deadline like an idle timeout would.
        for _ in 0..30 {
            if socket.write_all(b" ").is_err() {
                break;
            }
            thread::sleep(Duration::from_millis(30));
        }
    });
    (url, task)
}

fn falls_back_before_gui_timeout(body_stalls: bool) {
    let (url, official) = slow_official(body_stalls);
    let (admin_url, admin) = server(200, CATALOG.to_vec());
    let client = Client::builder().no_proxy().build().unwrap();
    let started = Instant::now();
    let payload = prefer_official(
        || {
            let _deadline =
                model_catalog_deadline::Scope::until(tokio::time::Instant::now() + TEST_DEADLINE);
            let response = send_with_timeout_retries(|| client.get(&url), "model discovery")?;
            stream_response(response)
        },
        || {
            assert!(
                model_catalog_deadline::current().is_none(),
                "Admin needs its own budget"
            );
            request_catalog(&client, admin_url)
        },
    )
    .unwrap();
    assert_catalog(payload, "catalog-v3");
    assert!(started.elapsed() < Duration::from_secs(2));
    official.join().unwrap();
    admin.join().unwrap();
}

#[test]
fn stalled_official_headers_reach_admin_within_discovery_budget() {
    falls_back_before_gui_timeout(false);
}

#[test]
fn trickling_official_body_cannot_delay_admin_fallback() {
    falls_back_before_gui_timeout(true);
}

#[test]
fn discovery_budget_limits_credentials_and_restores_the_worker_afterward() {
    let normal = Duration::from_secs(120);
    assert_eq!(
        model_catalog_deadline::credential_timeout(normal).unwrap(),
        normal
    );
    {
        let _scope = model_catalog_deadline::Scope::enter();
        let deadline = model_catalog_deadline::current().unwrap();
        let remaining = deadline - tokio::time::Instant::now();
        assert!(remaining > Duration::from_secs(59));
        assert!(remaining <= Duration::from_secs(60));
        assert_eq!(
            model_catalog_deadline::credential_timeout(normal).unwrap(),
            Duration::from_secs(3)
        );
        assert!(thread::spawn(model_catalog_deadline::current)
            .join()
            .unwrap()
            .is_none());
        let _expired = model_catalog_deadline::Scope::until(tokio::time::Instant::now());
        assert!(model_catalog_deadline::credential_timeout(normal).is_err());
    }
    assert!(model_catalog_deadline::current().is_none());
}
