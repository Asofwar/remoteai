use super::*;
use crate::update_peers::{
    block_download, block_protocol, signaling::Lease, tests::network_fixture,
};
use csw_chat_connectivity::{Connection, Event};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn download_pipelines_requests_and_accepts_headers_ahead_of_payloads() {
    let bytes = vec![31; 4 * 512 * 1024];
    let origin = Origin::with_bytes(bytes.clone());
    let update = origin.update().await;
    let directory = tempfile::tempdir().unwrap();
    let service = service(directory.path(), &origin.key);
    let mut artifact = Artifact::from_update(&update);
    service
        .cache
        .save(artifact.clone(), Arc::new(bytes.clone()))
        .await
        .unwrap();
    let snapshot = service.cache.snapshot(&artifact.id).unwrap();
    let coordinator = network_fixture::coordinator("pipeline-headers").await;
    let mut config = network_fixture::client(&coordinator, "pipeline-headers");
    config.desktop = true;
    let seed = Connection::start_with_packets(config.clone()).unwrap();
    let host = seed.clone();
    let worker = tokio::spawn(async move {
        let mut queued = Vec::new();
        while let Some(event) = host.receive().await {
            let Event::Data { text } = event else {
                continue;
            };
            let frame: serde_json::Value = serde_json::from_str(&text).unwrap();
            if frame["type"] == "describe" {
                host.send(
                    serde_json::json!({"type":"manifest", "size":snapshot.manifest.size,
                    "hashes":snapshot.manifest.hashes, "requestWindow":8})
                    .to_string(),
                )
                .await
                .unwrap();
            } else if frame["type"] == "read" {
                queued.push(frame["index"].as_u64().unwrap() as usize);
                // A stop-and-wait client cannot get any payload from this fixture.
                if queued.len() == 2 {
                    send_early_headers(&host, &snapshot, &queued).await;
                    queued.clear();
                }
            }
        }
    });
    config.desktop = false;
    let (sender, _receiver) = mpsc::channel(16);
    let mut leases = vec![Lease::binary(config, sender).unwrap()];
    artifact.url = "http://127.0.0.1:9/unavailable".into();
    let result = tokio::time::timeout(
        Duration::from_secs(15),
        block_download::download(&mut leases, &artifact, &service, |_, _| {}),
    )
    .await;
    drop(leases);
    seed.close();
    worker.abort();
    coordinator.stop().await;
    assert_eq!(result.unwrap().unwrap(), bytes);
    assert_eq!(
        service.policy.metrics.origin_bytes.load(Ordering::Relaxed),
        0
    );
}

async fn send_early_headers(
    connection: &Connection,
    snapshot: &Arc<crate::update_peers::snapshot::Snapshot>,
    indices: &[usize],
) {
    for &index in indices {
        connection
            .send(serde_json::json!({"type":"block", "index":index, "length":512*1024}).to_string())
            .await
            .unwrap();
    }
    for &index in indices {
        for packet in snapshot.block(index).await.unwrap().chunks(64 * 1024) {
            connection.send_packet(packet.to_vec()).await.unwrap();
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_empty_swarm_discovers_a_new_source_without_restarting_download() {
    let bytes = vec![47; 2 * 512 * 1024];
    let origin = Origin::with_bytes(bytes.clone());
    let update = origin.update().await;
    let directory = tempfile::tempdir().unwrap();
    let service = service(directory.path(), &origin.key);
    let mut artifact = Artifact::from_update(&update);
    service
        .cache
        .save(artifact.clone(), Arc::new(bytes.clone()))
        .await
        .unwrap();
    let snapshot = service.cache.snapshot(&artifact.id).unwrap();
    let coordinator = network_fixture::coordinator("late-update-seed").await;
    let mut config = network_fixture::client(&coordinator, "late-update-seed");
    config.desktop = true;
    let seed_config = config.clone();
    let id = artifact.id.clone();
    let policy = service.policy.clone();
    let (begin, mut started) = watch::channel(false);
    let (connected, mut seed) = tokio::sync::oneshot::channel();
    let serving = tokio::spawn(async move {
        started.changed().await.unwrap();
        // Real upload grants start both engines at lookup time, without an idle seed engine.
        let host = Connection::start_with_packets(seed_config).unwrap();
        connected.send(host.clone()).ok().unwrap();
        block_protocol::seed(&host, snapshot, &id, &policy).await
    });
    config.desktop = false;
    let (sender, mut requests) = mpsc::channel(16);
    service.broker.send_replace(Some(sender.clone()));
    let discovering = tokio::spawn(async move {
        while let Some(request) = requests.recv().await {
            if let Request::Find { reply, .. } = request {
                begin.send_replace(true);
                reply
                    .send(Ok(vec![Lease::binary(config, sender).unwrap()]))
                    .ok()
                    .unwrap();
                break;
            }
        }
    });
    artifact.url = "http://127.0.0.1:9/unavailable".into();
    let mut leases = Vec::new();
    let result = tokio::time::timeout(
        Duration::from_secs(25),
        block_download::download(&mut leases, &artifact, &service, |_, _| {}),
    )
    .await;
    drop(leases);
    let seed_result = if serving.is_finished() {
        Some(serving.await.unwrap())
    } else {
        serving.abort();
        None
    };
    if let Ok(seed) = seed.try_recv() {
        seed.close();
    }
    coordinator.stop().await;
    assert!(
        discovering.is_finished(),
        "no refill request before the download deadline"
    );
    discovering.await.unwrap();
    assert!(
        result.is_ok(),
        "download deadline elapsed; seed result: {seed_result:?}"
    );
    assert_eq!(result.unwrap().unwrap(), bytes);
    assert_eq!(
        service.policy.metrics.peer_bytes.load(Ordering::Relaxed),
        bytes.len() as u64
    );
}
