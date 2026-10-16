use super::super::{tests::connected_identity, *};
use crate::remote_chat::AckRequest;

#[test]
fn lost_ipc_ack_survives_socket_resets_but_is_fenced_before_host_replacement() {
    let mut runtime = connected_identity();
    assert!(runtime.bridge.as_mut().unwrap().flush());
    let expired = Instant::now() + Duration::from_secs(31);
    runtime.disconnect();
    runtime.reset();
    assert!(runtime.recover_stalled_ipc(expired));
    assert!(runtime.health.needs_restart());
    assert!(runtime.bridge.is_none());
    assert!(runtime.socket.is_none());
    assert!(runtime.sessions.authentication().is_empty());
    assert!(!runtime.recover_stalled_ipc(expired));

    let (sender, received) = sync_mpsc::channel();
    runtime.command(Command::Attach {
        client_id: "replacement".into(),
        bulk: None,
        deliver: Box::new(move |batch| sender.send(batch).is_ok()),
    });
    assert!(!runtime.health.needs_restart());
    assert!(runtime.bridge.as_mut().unwrap().flush());
    let reset = received.try_recv().unwrap();
    assert!(matches!(reset.events[0].event, Event::Reset));
    runtime.command(Command::Ack(AckRequest {
        client_id: "view".into(),
        sequence: reset.sequence,
    }));
    runtime
        .receive(r#"{"type":"peer-open","sessionId":"new-phone"}"#)
        .unwrap();
    assert!(runtime.bridge.as_mut().unwrap().flush());
    assert!(received.try_recv().is_err());
    runtime.command(Command::Ack(AckRequest {
        client_id: "replacement".into(),
        sequence: reset.sequence,
    }));
    assert!(runtime.bridge.as_mut().unwrap().flush());
    let paired = received.try_recv().unwrap();
    assert_eq!(paired.events.len(), 1);
    assert!(
        matches!(&paired.events[0].event, Event::Message { data } if data.contains("new-phone"))
    );
}

#[test]
fn acknowledged_or_idle_bridges_do_not_disconnect_healthy_sessions() {
    let mut runtime = connected_identity();
    let future = Instant::now() + Duration::from_secs(120);
    assert!(!runtime.recover_stalled_ipc(future));
    assert!(runtime.bridge.as_mut().unwrap().flush());
    runtime.command(Command::Ack(AckRequest {
        client_id: "view".into(),
        sequence: 1,
    }));
    assert!(!runtime.recover_stalled_ipc(future));
    assert!(runtime.sessions.contains("phone"));
    assert!(!runtime.health.needs_restart());
}

#[test]
fn a_failed_ipc_delivery_requests_replacement_without_waiting_for_an_ack() {
    let mut runtime = connected_identity();
    runtime.command(Command::Attach {
        client_id: "broken-view".into(),
        bulk: None,
        deliver: Box::new(|_| false),
    });
    runtime.tick();
    assert!(runtime.bridge.is_none());
    assert!(runtime.dial.is_none());
    assert!(runtime.health.needs_restart());
}

#[test]
fn bulk_backpressure_cannot_bypass_host_recovery() {
    let mut runtime = connected_identity();
    let channel = tauri::ipc::Channel::new(|_| Ok(()));
    runtime.bulk = crate::remote_chat::client_bulk::ClientBulk::new(Some(channel));
    runtime.bulk.negotiate(true);
    let mut frame = b"CSF1\x05phone".to_vec();
    let mut record = vec![7; 16 * 1024];
    record[..8].copy_from_slice(b"RAB1\x01\x01\x00\x48");
    record[64..68].copy_from_slice(&(16_384u32 - 88).to_be_bytes());
    frame.extend(record);
    while runtime.bulk.has_capacity() {
        runtime.bulk.enqueue(frame.clone(), Some("phone")).unwrap();
        runtime.bulk.flush().unwrap();
    }
    assert!(runtime.recover_stalled_ipc(Instant::now() + Duration::from_secs(31)));
    assert!(runtime.health.needs_restart());
    assert!(runtime.bulk.has_capacity());
    assert!(runtime.sessions.authentication().is_empty());
}
