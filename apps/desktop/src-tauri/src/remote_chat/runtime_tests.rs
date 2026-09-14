use super::*;

fn connected_identity() -> Runtime {
    let mut runtime = Runtime::default();
    runtime.command(Command::Attach {
        client_id: "view".into(),
        deliver: Box::new(|_| true),
    });
    runtime.configure(Some(Config {
        websocket_url: "ws://localhost/device-chat".into(),
        device_id: "pc".into(),
        access_token: "token".into(),
        owner: "owner".into(),
    }));
    runtime
        .sessions
        .receive(
            &json!({ "type": "peer-open", "sessionId": "phone", "transportVersion": 2,
        "resumeToken": "proof", "expiresAt": super::super::sessions::now_ms() + 120_000 }),
        )
        .unwrap();
    runtime.sessions.key_sent("phone");
    runtime
}

#[test]
fn renewal_preserves_resumes_but_logout_and_owner_changes_revoke_them() {
    let mut runtime = connected_identity();
    let mut renewed = runtime.config.clone().unwrap();
    renewed.access_token = "new-token".into();
    runtime.configure(Some(renewed.clone()));
    assert!(runtime.sessions.contains("phone"));
    renewed.owner = "other-owner".into();
    runtime.configure(Some(renewed));
    assert!(!runtime.sessions.contains("phone"));
    let mut runtime = connected_identity();
    runtime.configure(None);
    assert!(!runtime.sessions.contains("phone"));
    assert!(runtime.config.is_none());
}

#[test]
fn forgetting_a_destroyed_key_works_offline_and_across_a_socket_reconnect() {
    let mut runtime = connected_identity();
    let generation = runtime.generation;
    runtime.disconnect();
    runtime.send(SendRequest {
        client_id: "old-view".into(),
        generation,
        message: Outgoing::PeerClose {
            session_id: "phone".into(),
        },
    });
    assert!(runtime.sessions.contains("phone"));
    runtime.send(SendRequest {
        client_id: "view".into(),
        generation,
        message: Outgoing::PeerClose {
            session_id: "phone".into(),
        },
    });
    assert!(!runtime.sessions.contains("phone"));
}

#[test]
fn a_login_change_discards_an_in_flight_dial_before_authenticating() {
    let mut runtime = connected_identity();
    let (sender, receiver) = sync_mpsc::channel();
    runtime.dial = Some((runtime.generation, receiver));
    runtime.configure(None);
    sender.send(Err(ChatError::Transport)).unwrap();
    let reset_generation = runtime.generation;
    runtime.finish_dial();
    assert_eq!(runtime.generation, reset_generation);
    assert!(runtime.dial.is_none());
    assert!(runtime.socket.is_none());
}
