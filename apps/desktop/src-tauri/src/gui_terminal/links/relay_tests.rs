use super::*;
use std::time::Duration;
use tokio::net::TcpListener;

struct Endpoint {
    state: Arc<LinkState>,
    scope: String,
    id: String,
}
impl Endpoint {
    async fn pump(&self, destination: &Self) {
        loop {
            let LinkReply::Data { data, eof } = self
                .state
                .perform(LinkRequest::Read {
                    scope: self.scope.clone(),
                    id: self.id.clone(),
                })
                .await
                .unwrap()
            else {
                panic!("data expected")
            };
            if !data.is_empty() {
                destination
                    .state
                    .perform(LinkRequest::Write {
                        scope: destination.scope.clone(),
                        id: destination.id.clone(),
                        data,
                    })
                    .await
                    .unwrap();
            }
            if eof {
                return;
            }
        }
    }
}

async fn bridge(local: Arc<LinkState>, scope: String, url: String) {
    let LinkReply::Socket { id } = local
        .perform(LinkRequest::Accept {
            scope: scope.clone(),
        })
        .await
        .unwrap()
    else {
        panic!("local socket expected")
    };
    let remote = Arc::new(LinkState::default());
    let remote_scope = uuid::Uuid::new_v4().to_string();
    let LinkReply::Socket { id: remote_id } = remote
        .perform(LinkRequest::Connect {
            scope: remote_scope.clone(),
            url,
        })
        .await
        .unwrap()
    else {
        panic!("remote socket expected")
    };
    let local = Endpoint {
        state: local,
        scope,
        id,
    };
    let remote = Endpoint {
        state: remote,
        scope: remote_scope,
        id: remote_id,
    };
    tokio::select! { _ = local.pump(&remote) => {}, _ = remote.pump(&local) => {} }
    for endpoint in [local, remote] {
        endpoint
            .state
            .perform(LinkRequest::Stop {
                scope: endpoint.scope,
            })
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn browser_websocket_reaches_an_independent_remote_server_through_the_byte_relay() {
    tokio::time::timeout(Duration::from_secs(15), websocket_round_trip())
        .await
        .unwrap();
}

async fn websocket_round_trip() {
    let remote = TcpListener::bind("127.0.0.1:0")
        .await
        .unwrap()
        .into_std()
        .unwrap();
    remote.set_nonblocking(false).unwrap();
    let remote_url = format!("http://{}", remote.local_addr().unwrap());
    let server = tokio::task::spawn_blocking(move || {
        let (stream, _) = remote.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(10)))
            .unwrap();
        let mut websocket = tungstenite::accept(stream).unwrap();
        let request = websocket.read().unwrap();
        assert_eq!(request.to_text().unwrap(), "vite-hmr-test");
        websocket
            .send(tungstenite::Message::text("remote-hot-update"))
            .unwrap();
    });
    let local = Arc::new(LinkState::default());
    let LinkReply::Listener { id, port } = local.perform(LinkRequest::Listen).await.unwrap() else {
        panic!("local listener expected")
    };
    let forwarding = tokio::spawn(bridge(local, id, remote_url));
    tokio::task::spawn_blocking(move || {
        let (mut browser, _) =
            tungstenite::connect(format!("ws://127.0.0.1:{port}/hmr?token=test")).unwrap();
        browser
            .send(tungstenite::Message::text("vite-hmr-test"))
            .unwrap();
        assert_eq!(
            browser.read().unwrap().to_text().unwrap(),
            "remote-hot-update"
        );
    })
    .await
    .unwrap();
    server.await.unwrap();
    forwarding.await.unwrap();
}
