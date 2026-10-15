use std::{net::TcpListener, sync::atomic::AtomicBool, thread, time::Duration};

use super::*;

fn client() -> (tempfile::TempDir, config::ClientRecord, String) {
    let root = tempfile::tempdir().unwrap();
    let record = config::ClientRecord {
        home: root.path().join("home"),
        token: config::new_token(),
        enabled: true,
    };
    let id = config::client_id(&record.home);
    config::save(root.path(), &id, &record).unwrap();
    (root, record, id)
}

#[test]
fn a_live_session_survives_idle_time_and_ends_on_eof() {
    let (root, record, client_id) = client();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let stream = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    let (mut peer, _) = listener.accept().unwrap();
    let request = SessionRequest::Session {
        client_id,
        session_id: uuid::Uuid::new_v4().to_string(),
        token: record.token,
    };
    thread::scope(|scope| {
        let waiting =
            scope.spawn(|| wait(&mut peer, root.path(), &request, &AtomicBool::new(true)));
        thread::sleep(CHECK_INTERVAL * 2);
        assert!(!waiting.is_finished());
        drop(stream);
        assert!(waiting.join().unwrap().is_ok());
    });
}

#[test]
fn disabling_a_home_ends_an_idle_session_without_another_tool_call() {
    let (root, mut record, client_id) = client();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let _stream = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    let (mut peer, _) = listener.accept().unwrap();
    let request = SessionRequest::Session {
        client_id: client_id.clone(),
        session_id: uuid::Uuid::new_v4().to_string(),
        token: record.token.clone(),
    };
    thread::scope(|scope| {
        let waiting =
            scope.spawn(|| wait(&mut peer, root.path(), &request, &AtomicBool::new(true)));
        thread::sleep(Duration::from_millis(50));
        record.enabled = false;
        config::save(root.path(), &client_id, &record).unwrap();
        assert!(matches!(
            waiting.join().unwrap(),
            Err(BrowserError::Disabled)
        ));
    });
}
