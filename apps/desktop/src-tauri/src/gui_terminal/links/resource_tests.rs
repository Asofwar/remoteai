use super::*;
use tokio::net::TcpListener;

#[tokio::test]
async fn udp_resources_reject_other_targets_owners_and_remote_listeners() {
    let state = Arc::new(LinkState::default());
    let url = "http://127.0.0.1:53".to_string();
    let scope = open_resource(&state, url.clone()).await.unwrap();
    let other = open_resource(&state, url.clone()).await.unwrap();
    assert!(resource_request(
        &state,
        LinkRequest::UdpListen {
            port: 1053,
            version: 2
        }
    )
    .await
    .is_err());
    assert!(resource_request(
        &state,
        LinkRequest::UdpConnect {
            scope: scope.clone(),
            url: "http://127.0.0.1:54".into(),
            version: 2,
        }
    )
    .await
    .is_err());
    let LinkReply::Socket { id } = resource_request(
        &state,
        LinkRequest::UdpConnect {
            scope: scope.clone(),
            url,
            version: 2,
        },
    )
    .await
    .unwrap() else {
        panic!()
    };
    assert!(resource_request(
        &state,
        LinkRequest::UdpRead {
            scope: other,
            id: id.clone()
        }
    )
    .await
    .is_err());
    resource_request(
        &state,
        LinkRequest::Stop {
            scope: scope.clone(),
        },
    )
    .await
    .unwrap();
    assert!(resource_request(&state, LinkRequest::UdpRead { scope, id })
        .await
        .is_err());
}

#[tokio::test]
async fn resource_streams_reject_other_destinations_scopes_and_listener_commands() {
    let state = Arc::new(LinkState::default());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/file", listener.local_addr().unwrap());
    let scope = open_resource(&state, url.clone()).await.unwrap();
    let other = open_resource(&state, url.clone()).await.unwrap();
    assert!(open_resource(&state, "file:///C:/secret".into())
        .await
        .is_err());
    assert!(resource_request(&state, LinkRequest::Listen { port: None })
        .await
        .is_err());
    assert!(resource_request(
        &state,
        LinkRequest::Connect {
            scope: scope.clone(),
            url: "http://localhost:9".into(),
        }
    )
    .await
    .is_err());
    let LinkReply::Socket { id } = resource_request(
        &state,
        LinkRequest::Connect {
            scope: scope.clone(),
            url,
        },
    )
    .await
    .unwrap() else {
        panic!("socket expected")
    };
    assert!(resource_request(
        &state,
        LinkRequest::Read {
            scope: other,
            id: id.clone()
        }
    )
    .await
    .is_err());
    resource_request(
        &state,
        LinkRequest::Stop {
            scope: scope.clone(),
        },
    )
    .await
    .unwrap();
    assert!(resource_request(&state, LinkRequest::Read { scope, id })
        .await
        .is_err());
}

#[tokio::test]
async fn resource_registrations_are_bounded_and_reusable_after_close() {
    let state = Arc::new(LinkState::default());
    let mut ids = Vec::new();
    for _ in 0..MAX_RESOURCES {
        ids.push(
            open_resource(&state, "http://127.0.0.1:80".into())
                .await
                .unwrap(),
        );
    }
    assert!(open_resource(&state, "http://127.0.0.1:80".into())
        .await
        .is_err());
    resource_request(
        &state,
        LinkRequest::Stop {
            scope: ids.pop().unwrap(),
        },
    )
    .await
    .unwrap();
    assert!(open_resource(&state, "http://127.0.0.1:80".into())
        .await
        .is_ok());
}
