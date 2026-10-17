use super::*;

fn datagram(bytes: usize) -> Datagram {
    Datagram {
        peer: "client".into(),
        data: vec![42; bytes],
    }
}

#[tokio::test]
async fn burst_capacity_counts_empty_packets_and_releases_byte_permits_after_reads() {
    let (sender, receiver) = queue::channel();
    let mut reader = queue::Reader::new(receiver);
    let (_cancel, mut cancellation) = tokio::sync::watch::channel(false);
    for _ in 0..QUEUE_SIZE {
        assert!(sender.push(datagram(0)));
    }
    assert!(!sender.push(datagram(0)));
    for _ in 0..QUEUE_SIZE / MAX_BATCH {
        assert_eq!(
            reader.read(&mut cancellation).await.unwrap().len(),
            MAX_BATCH
        );
    }
    for _ in 0..QUEUE_BYTES / MAX_DATAGRAM {
        assert!(sender.push(datagram(MAX_DATAGRAM)));
    }
    assert!(!sender.push(datagram(MAX_DATAGRAM)));
    let batch = reader.read(&mut cancellation).await.unwrap();
    assert_eq!(batch.len(), MAX_BATCH_BYTES / MAX_DATAGRAM);
    assert!(sender.push(datagram(MAX_DATAGRAM)));
    // A packet deferred at the batch byte limit must be returned next, never dropped.
    let next = reader.read(&mut cancellation).await.unwrap();
    assert_eq!(next.len(), MAX_BATCH_BYTES / MAX_DATAGRAM);
}

#[test]
fn protocol_requires_current_version_without_a_legacy_path() {
    assert!(require_version(2).is_ok());
    assert!(require_version(1).is_err());
    assert!(require_version(3).is_err());
    assert!(
        serde_json::from_value::<super::super::LinkRequest>(serde_json::json!({
            "type": "udpConnect", "scope": "s", "url": "http://127.0.0.1:53"
        }))
        .is_err()
    );
}

#[tokio::test]
async fn oversized_batch_is_rejected_before_any_datagram_is_enqueued() {
    let sessions = Sessions::default();
    let LinkReply::Socket { id } = sessions
        .connect("r".into(), "http://127.0.0.1:53".into())
        .await
        .unwrap()
    else {
        panic!()
    };
    let packets = (0..5)
        .map(|_| Packet {
            peer: "p".into(),
            data: STANDARD.encode(vec![0; MAX_DATAGRAM]),
        })
        .collect();
    assert!(sessions.write("r", &id, packets).await.is_err());
    sessions.stop("r").await;
}
