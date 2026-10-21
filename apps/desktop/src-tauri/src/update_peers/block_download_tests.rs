use super::*;
use crate::update_peers::{block_download, signaling::Lease, tests::network_fixture};

#[path = "tests/block_recovery_fixture.rs"]
mod recovery_fixture;

const RECOVERY_SETUP_TIMEOUT: Duration = Duration::from_secs(45);
const RECOVERY_TRANSFER_TIMEOUT: Duration = Duration::from_secs(40);

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn origin_ranges_finish_without_waiting_for_an_unresponsive_peer() {
    let bytes = vec![29; 2 * 1024 * 1024 + 7];
    let origin = Origin::with_bytes(bytes.clone());
    let update = origin.update().await;
    let directory = tempfile::tempdir().unwrap();
    let service = service(directory.path(), &origin.key);
    let artifact = Artifact::from_update(&update);
    let coordinator = network_fixture::coordinator("origin-hedge").await;
    let config = network_fixture::client(&coordinator, "missing-seed");
    let (sender, _receiver) = mpsc::channel(16);
    let mut leases = vec![Lease::binary(config, sender).unwrap()];
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        block_download::download(&mut leases, &artifact, &service, |_, _| {}),
    )
    .await;
    drop(leases);
    coordinator.stop().await;
    let received = result.unwrap().unwrap();
    artifact.verify(&received, &origin.key).unwrap();
    assert_eq!(received, bytes);
    assert_eq!(
        service.policy.metrics.origin_bytes.load(Ordering::Relaxed),
        bytes.len() as u64
    );
    assert!(origin.downloads.load(Ordering::Relaxed) > 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 6)]
async fn disconnected_source_does_not_discard_other_peers_blocks() {
    let bytes = vec![73; 2 * 1024 * 1024 + 17];
    let origin = Origin::with_bytes(bytes.clone());
    let update = origin.update().await;
    let directory = tempfile::tempdir().unwrap();
    let seed_service = service(directory.path(), &origin.key);
    let mut artifact = Artifact::from_update(&update);
    seed_service
        .cache
        .save(artifact.clone(), Arc::new(bytes.clone()))
        .await
        .unwrap();
    let snapshot = seed_service.cache.snapshot(&artifact.id).unwrap();
    let (sender, _receiver) = mpsc::channel(16);
    let (failed_request, observer) = watch::channel(false);
    let mut seeds = vec![
        recovery_fixture::Seed::start(
            "block-recovery-broken",
            snapshot.clone(),
            recovery_fixture::Role::Disconnect(failed_request.clone()),
        )
        .await,
        recovery_fixture::Seed::start(
            "block-recovery-healthy",
            snapshot,
            recovery_fixture::Role::Recover(observer),
        )
        .await,
    ];
    let mut leases = seeds
        .iter()
        .map(|seed| Lease::binary(seed.config.clone(), sender.clone()).unwrap())
        .collect();
    artifact.url = "http://127.0.0.1:9/unavailable".into();
    let result = recover_after_preparation(&mut seeds, &mut leases, &artifact, &seed_service).await;
    drop(leases);
    for seed in seeds {
        seed.finish().await;
    }
    assert_eq!(result.unwrap(), bytes);
    assert!(
        *failed_request.borrow(),
        "the first source never disconnected"
    );
    assert!(seed_service.policy.metrics.retries.load(Ordering::Relaxed) >= 1);
    assert_eq!(origin.downloads.load(Ordering::Relaxed), 0);
}

async fn recover_after_preparation(
    seeds: &mut [recovery_fixture::Seed],
    leases: &mut Vec<Lease>,
    artifact: &Artifact,
    service: &Service,
) -> std::result::Result<Vec<u8>, String> {
    tokio::time::timeout(RECOVERY_SETUP_TIMEOUT, async {
        for seed in seeds {
            (&mut seed.ready)
                .await
                .map_err(|_| "recovery seed stopped during preparation".to_owned())?;
        }
        Ok::<_, String>(())
    })
    .await
    .map_err(|_| "recovery seeds did not become ready".to_owned())??;
    tokio::time::timeout(
        RECOVERY_TRANSFER_TIMEOUT,
        block_download::download(leases, artifact, service, |_, _| {}),
    )
    .await
    .map_err(|_| "recovery timed out after both sources became ready".to_owned())?
    .map_err(|error| format!("recovery failed after both sources became ready: {error}"))
}

#[tokio::test]
async fn immutable_digest_snapshot_rejects_same_size_local_corruption() {
    let origin = Origin::start();
    let update = origin.update().await;
    let directory = tempfile::tempdir().unwrap();
    let service = service(directory.path(), &origin.key);
    let artifact = Artifact::from_update(&update);
    service
        .cache
        .save(artifact.clone(), Arc::new(b"signed installer".to_vec()))
        .await
        .unwrap();
    let snapshot = service.cache.snapshot(&artifact.id).unwrap();
    std::fs::write(
        directory.path().join(format!("{}.pkg", artifact.id)),
        b"broken installer",
    )
    .unwrap();
    assert!(snapshot.block(0).await.is_err());
}
