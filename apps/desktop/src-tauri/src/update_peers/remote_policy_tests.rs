use super::*;
use crate::update_peers::policy::SharingScope;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn response(bodies: Vec<String>) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/api", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        for body in bodies {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![0; 4096];
            let length = socket.read(&mut request).await.unwrap();
            assert!(String::from_utf8_lossy(&request[..length])
                .starts_with("GET /api/update-sharing/settings HTTP/1.1"));
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            socket.write_all(header.as_bytes()).await.unwrap();
            socket.write_all(body.as_bytes()).await.unwrap();
        }
    });
    (url, task)
}

#[tokio::test]
async fn remote_refresh_applies_all_fields_and_keeps_policy_after_invalid_responses() {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .unwrap();
    let policy = Policy::new();
    let settings = Preferences {
        scope: SharingScope::Own,
        upload_kib_per_second: 64,
        unmetered_only: true,
        prepare_android: false,
    };
    let (base, task) = response(vec![
        serde_json::to_string(&settings).unwrap(),
        "{}".to_owned(),
        "x".repeat(MAX_POLICY_BYTES + 1),
    ])
    .await;
    policy.select_server(Some(base.clone()));
    refresh(&client, &policy, &base).await.unwrap();
    assert_eq!(policy.preferences(), settings);
    assert!(!policy.allows_upload());
    for _ in 0..2 {
        assert!(refresh(&client, &policy, &base).await.is_err());
        assert_eq!(policy.preferences(), settings);
    }
    task.await.unwrap();
    assert!(refresh(&client, &policy, &base).await.is_err());
    assert_eq!(policy.preferences(), settings);
}

#[tokio::test]
async fn restart_with_an_unavailable_policy_endpoint_disables_metered_sharing() {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .unwrap();
    let settings = Preferences {
        scope: SharingScope::Everyone,
        upload_kib_per_second: 128,
        unmetered_only: true,
        prepare_android: false,
    };
    let policy = Policy::new();
    let (base, task) = response(vec![serde_json::to_string(&settings).unwrap()]).await;
    policy.select_server(Some(base.clone()));
    refresh(&client, &policy, &base).await.unwrap();
    task.await.unwrap();
    assert_eq!(policy.preferences(), settings);
    drop(policy);

    // Recreate the startup state on a metered/unknown network after the endpoint goes offline.
    let restarted = Policy::new();
    restarted.select_server(Some(base.clone()));
    assert!(refresh(&client, &restarted, &base).await.is_err());
    assert_eq!(restarted.preferences().scope, SharingScope::Off);
    assert!(!restarted.preferences().prepare_android);
    assert!(restarted.preferences().unmetered_only);
    assert!(!restarted.allows_network());
    assert!(!restarted.allows_download());
    assert!(!restarted.allows_upload());
    assert!(restarted.throttle(1024).await.is_err());

    let (base, task) = response(vec![serde_json::to_string(&settings).unwrap()]).await;
    restarted.select_server(Some(base.clone()));
    refresh(&client, &restarted, &base).await.unwrap();
    task.await.unwrap();
    assert_eq!(restarted.preferences(), settings);
    assert!(restarted.allows_download());
    assert!(!restarted.allows_upload());
}
