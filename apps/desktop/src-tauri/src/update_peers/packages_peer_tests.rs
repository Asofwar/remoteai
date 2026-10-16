use super::*;
use crate::update_peers::{signaling::Lease, tests::network_fixture};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn dependency_peers_verify_bytes_and_release_failed_transfers_for_origin_fallback() {
    for behavior in ["valid", "tampered", "disconnected", "cache-unwritable"] {
        exercise(behavior).await;
    }
}

async fn exercise(behavior: &'static str) {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("cache");
    if behavior == "cache-unwritable" {
        std::fs::write(&path, b"not a directory").unwrap();
    }
    let mut service = service(&path);
    let reports = Arc::new(std::sync::Mutex::new(Vec::new()));
    let captured = reports.clone();
    Arc::get_mut(&mut service).unwrap().reporter = Some(Arc::new(move || {
        let captured = captured.clone();
        Some(Box::new(move |report| {
            captured
                .lock()
                .unwrap()
                .push(serde_json::to_value(report).unwrap());
        }))
    }));
    let package = package();
    let host = network_fixture::host(&format!("dependency-{behavior}")).await;
    let mut listener = host
        .data_plane_tcp_bind(47777, Duration::from_secs(3))
        .await
        .unwrap();
    let (sender, mut receiver) = mpsc::channel(4);
    service.broker.send_replace(Some(sender.clone()));
    let config = network_fixture::client(&host, &format!("dependency-{behavior}"));
    let signaling = tokio::spawn(async move {
        let Some(Request::Find { reply, .. }) = receiver.recv().await else {
            panic!("expected lookup")
        };
        assert!(reply
            .send(Lease::new(config, sender).map(|lease| vec![lease]))
            .is_ok());
        assert!(matches!(
            receiver.recv().await,
            Some(Request::Finish(_) | Request::Failed(_))
        ));
    });
    let seed = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let size = stream.read_u32().await.unwrap() as usize;
        let mut request = vec![0; size];
        stream.read_exact(&mut request).await.unwrap();
        respond(&mut stream, behavior).await;
    });
    let mut progress = 0;
    let result = tokio::time::timeout(
        Duration::from_secs(25),
        shared(&service, &package.0, |length, _| progress += length),
    )
    .await;
    host.stop().await;
    seed.abort();
    tokio::time::timeout(Duration::from_secs(3), signaling)
        .await
        .unwrap()
        .unwrap();
    check_result(behavior, result.unwrap(), progress, (&service, &package)).await;
    if behavior == "valid" {
        shared(&service, &package.0, |_, _| {}).await.unwrap();
    }
    let reports = reports.lock().unwrap();
    assert_eq!(reports.len(), 1, "cached packages must not count again");
    let success = matches!(behavior, "valid" | "cache-unwritable");
    assert_eq!(
        reports[0]["outcome"],
        if success { "success" } else { "failed" }
    );
    assert_eq!(reports[0]["serverBytes"], 0);
    if behavior == "tampered" {
        assert_eq!(reports[0]["failures"][0]["stage"], "verify");
    }
}

async fn check_result(
    behavior: &str,
    result: Result<Arc<Vec<u8>>>,
    progress: usize,
    service_and_package: (&Arc<Service>, &Package),
) {
    let (service, package) = service_and_package;
    if matches!(behavior, "valid" | "cache-unwritable") {
        assert_eq!(result.unwrap().as_slice(), BYTES);
        assert_eq!(progress, BYTES.len());
        if behavior == "valid" {
            assert_eq!(service.cache.read(&package.0.id).await.unwrap(), BYTES);
        }
    } else {
        assert!(result.is_err(), "{behavior}");
        assert!(service.cache.artifacts().is_empty());
    }
}

async fn respond(stream: &mut (impl AsyncReadExt + AsyncWriteExt + Unpin), behavior: &str) {
    frame(
        stream,
        serde_json::json!({"type":"header", "size":BYTES.len()}),
    )
    .await;
    if behavior == "disconnected" {
        return;
    }
    let bytes = if behavior == "tampered" {
        vec![0; BYTES.len()]
    } else {
        BYTES.to_vec()
    };
    frame(
        stream,
        serde_json::json!({"type":"chunk", "offset":0, "data":STANDARD.encode(bytes)}),
    )
    .await;
    frame(stream, serde_json::json!({"type":"complete"})).await;
    let _receipt = tokio::time::timeout(Duration::from_secs(5), stream.read_u32()).await;
}

async fn frame(stream: &mut (impl AsyncWriteExt + Unpin), value: serde_json::Value) {
    let bytes = value.to_string();
    stream.write_u32(bytes.len() as u32).await.unwrap();
    stream.write_all(bytes.as_bytes()).await.unwrap();
}
