use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    time::{timeout, Duration},
};

const CHUNK_BYTES: usize = 384 * 1024;

#[tokio::test]
async fn native_mapping_claim_is_scoped_to_an_active_loopback_listener() {
    let state = std::sync::Arc::new(super::LinkState::default());
    let super::LinkReply::Listener { id: scope, port } = state
        .perform(super::LinkRequest::Listen { port: None })
        .await
        .unwrap()
    else {
        panic!("listener");
    };
    let browser = tokio::net::TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port))
        .await
        .unwrap();
    let super::LinkReply::Socket { id } = state
        .perform(super::LinkRequest::Accept {
            scope: scope.clone(),
        })
        .await
        .unwrap()
    else {
        panic!("socket");
    };
    assert!(state
        .take_loopback_socket("wrong-scope", &id)
        .await
        .is_err());
    let halves = state.take_loopback_socket(&scope, &id).await.unwrap();
    assert!(state.take_loopback_socket(&scope, &id).await.is_err());
    state
        .perform(super::LinkRequest::Stop { scope })
        .await
        .unwrap();
    let rebound = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
        .await
        .unwrap();
    drop((halves, browser, rebound));
}

async fn socket() -> (Arc<LinkState>, String, String, TcpStream) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let state = Arc::new(LinkState::default());
    let scope = "chunks".to_string();
    let reply = state
        .perform(LinkRequest::Connect {
            scope: scope.clone(),
            url: format!("http://{}", listener.local_addr().unwrap()),
        })
        .await
        .unwrap();
    let LinkReply::Socket { id } = reply else {
        panic!("socket expected")
    };
    let (peer, _) = listener.accept().await.unwrap();
    (state, scope, id, peer)
}

#[tokio::test]
async fn small_replies_do_not_wait_to_fill_a_large_chunk_or_for_eof() {
    let (state, scope, id, mut peer) = socket().await;
    peer.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
        .await
        .unwrap();
    let reply = timeout(
        Duration::from_secs(1),
        state.perform(LinkRequest::Read {
            scope: scope.clone(),
            id,
        }),
    )
    .await
    .unwrap()
    .unwrap();
    let LinkReply::Data { data, eof } = reply else {
        panic!("data expected")
    };
    assert_eq!(
        STANDARD.decode(data).unwrap(),
        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok"
    );
    assert!(!eof);
    state.perform(LinkRequest::Stop { scope }).await.unwrap();
}

#[tokio::test]
async fn large_reads_are_bounded_and_preserve_binary_payloads() {
    let (state, scope, id, mut peer) = socket().await;
    let payload: Vec<_> = (0..CHUNK_BYTES * 3)
        .map(|index| (index % 251) as u8)
        .collect();
    let sent = payload.clone();
    let writer = tokio::spawn(async move {
        peer.write_all(&sent).await.unwrap();
    });
    let mut received = Vec::new();
    let mut largest = 0;
    loop {
        let reply = state
            .perform(LinkRequest::Read {
                scope: scope.clone(),
                id: id.clone(),
            })
            .await
            .unwrap();
        let LinkReply::Data { data, eof } = reply else {
            panic!("data expected")
        };
        let bytes = STANDARD.decode(data).unwrap();
        largest = largest.max(bytes.len());
        assert!(bytes.len() <= CHUNK_BYTES);
        received.extend(bytes);
        if eof {
            break;
        }
    }
    assert_eq!(received, payload);
    assert!(largest > 48 * 1024);
    writer.await.unwrap();
    state.perform(LinkRequest::Stop { scope }).await.unwrap();
}

#[tokio::test]
async fn large_writes_enforce_the_same_bound_without_partial_oversized_writes() {
    let (state, scope, id, mut peer) = socket().await;
    let receiving = tokio::spawn(async move {
        let mut bytes = vec![0; CHUNK_BYTES];
        peer.read_exact(&mut bytes).await.unwrap();
        assert!(bytes.iter().all(|byte| *byte == 42));
    });
    assert!(matches!(
        state
            .perform(LinkRequest::Write {
                scope: scope.clone(),
                id: id.clone(),
                data: STANDARD.encode(vec![43; CHUNK_BYTES + 1]),
            })
            .await,
        Err(LinkError::Invalid)
    ));
    state
        .perform(LinkRequest::Write {
            scope: scope.clone(),
            id,
            data: STANDARD.encode(vec![42; CHUNK_BYTES]),
        })
        .await
        .unwrap();
    receiving.await.unwrap();
    state.perform(LinkRequest::Stop { scope }).await.unwrap();
}
