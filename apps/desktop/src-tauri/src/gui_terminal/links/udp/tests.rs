use super::*;
use tokio::time::timeout;

#[tokio::test]
async fn remote_udp_reaches_ipv6_targets() {
    let sessions = Sessions::default();
    let server = UdpSocket::bind("[::1]:0").await.unwrap();
    let LinkReply::Socket { id } = sessions
        .connect(
            "ipv6".into(),
            format!("http://{}", server.local_addr().unwrap()),
        )
        .await
        .unwrap()
    else {
        panic!()
    };
    sessions
        .write(
            "ipv6",
            &id,
            vec![Packet {
                peer: "client".into(),
                data: STANDARD.encode([1, 2, 3]),
            }],
        )
        .await
        .unwrap();
    let mut bytes = [0; 10];
    let (size, peer) = timeout(Duration::from_secs(3), server.recv_from(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(&bytes[..size], &[1, 2, 3]);
    server.send_to(&bytes[..size], peer).await.unwrap();
    let returned = packets(&sessions, "ipv6", &id).await;
    assert_eq!(returned[0].peer, "client");
    assert_eq!(returned[0].data, STANDARD.encode([1, 2, 3]));
    sessions.stop("ipv6").await;
}

async fn local(sessions: &Sessions) -> (String, u16) {
    let reservation = UdpSocket::bind("127.0.0.1:0").await.unwrap();
    let port = reservation.local_addr().unwrap().port();
    drop(reservation);
    let LinkReply::Listener { id, .. } = sessions.listen(port).await.unwrap() else {
        panic!()
    };
    (id, port)
}

async fn packets(sessions: &Sessions, scope: &str, id: &str) -> Vec<Packet> {
    let LinkReply::Datagrams { packets } =
        timeout(Duration::from_secs(3), sessions.read(scope, id))
            .await
            .unwrap()
            .unwrap()
    else {
        panic!()
    };
    packets
}

#[tokio::test]
async fn datagrams_roundtrip_separate_clients_preserving_empty_binary_and_large_packets() {
    let sessions = Sessions::default();
    let (local, port) = local(&sessions).await;
    let tcp = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .unwrap();
    let echo = UdpSocket::bind("127.0.0.1:0").await.unwrap();
    let LinkReply::Socket { id: remote } = sessions
        .connect(
            "resource".into(),
            format!("http://{}", echo.local_addr().unwrap()),
        )
        .await
        .unwrap()
    else {
        panic!()
    };
    let clients = [
        UdpSocket::bind("127.0.0.1:0").await.unwrap(),
        UdpSocket::bind("127.0.0.1:0").await.unwrap(),
    ];
    let mut server_peers = Vec::new();
    for (index, data) in [vec![], vec![0, 255, 128], vec![93; MAX_DATAGRAM]]
        .iter()
        .enumerate()
    {
        let client = &clients[index % 2];
        client.send_to(data, ("127.0.0.1", port)).await.unwrap();
        let outgoing = packets(&sessions, &local, &local).await;
        assert_eq!(outgoing.len(), 1);
        sessions.write("resource", &remote, outgoing).await.unwrap();
        let mut bytes = vec![0; MAX_DATAGRAM + 1];
        let (size, address) = timeout(Duration::from_secs(3), echo.recv_from(&mut bytes))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(&bytes[..size], data);
        server_peers.push(address);
        echo.send_to(&bytes[..size], address).await.unwrap();
        let incoming = packets(&sessions, "resource", &remote).await;
        sessions.write(&local, &local, incoming).await.unwrap();
        let (size, _) = timeout(Duration::from_secs(3), client.recv_from(&mut bytes))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(&bytes[..size], data);
    }
    assert_ne!(server_peers[0], server_peers[1]);
    assert_eq!(server_peers[0], server_peers[2]);
    sessions.stop("resource").await;
    sessions.stop(&local).await;
    drop(tcp);
}

#[tokio::test]
async fn port_conflicts_scope_isolation_cancellation_and_immediate_reuse() {
    let sessions = Arc::new(Sessions::default());
    let (id, port) = local(&sessions).await;
    assert!(matches!(
        sessions.listen(port).await,
        Err(LinkError::PortInUse)
    ));
    assert!(sessions.read("wrong-owner", &id).await.is_err());
    assert!(sessions.close("wrong-owner", &id).await.is_err());
    let reader = sessions.clone();
    let scope = id.clone();
    let pending = tokio::spawn(async move { reader.read(&scope, &scope).await });
    tokio::task::yield_now().await;
    sessions.stop(&id).await;
    assert!(timeout(Duration::from_secs(1), pending)
        .await
        .unwrap()
        .unwrap()
        .is_err());
    assert!(UdpSocket::bind(("127.0.0.1", port)).await.is_ok());
}

#[test]
fn validates_datagram_and_peer_limits_before_enqueuing_any_packets() {
    assert!(decode(Packet {
        peer: "peer-1".into(),
        data: String::new()
    })
    .is_ok());
    assert!(decode(Packet {
        peer: "127.0.0.1:80".into(),
        data: String::new()
    })
    .is_err());
    assert!(decode(Packet {
        peer: "p".repeat(65),
        data: String::new()
    })
    .is_err());
    assert!(decode(Packet {
        peer: "peer".into(),
        data: "?".into()
    })
    .is_err());
    assert!(decode(Packet {
        peer: "peer".into(),
        data: STANDARD.encode(vec![0; MAX_DATAGRAM + 1])
    })
    .is_err());
}
