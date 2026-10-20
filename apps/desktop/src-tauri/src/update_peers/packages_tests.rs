use super::*;
use crate::update_peers::{cache::Cache, signaling::Request};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, watch, Semaphore};

const CODEX_URL: &str = concat!(
    "https://github.com/openai/codex/releases/download/rust-v1.0.0/",
    "codex-package-x86_64-pc-windows-msvc.tar.gz"
);
const DRIVER_URL: &str = concat!(
    "https://github.com/piperhex/remoteai/releases/download/cua-v1.0.0/",
    "cua-driver-rs-1.0.0-windows-x86_64.zip"
);
const BYTES: &[u8] = b"verified dependency";

#[test]
fn downstream_cua_packages_require_exact_remoteai_release_urls() {
    let version = "0.37.0-remoteai.2";
    let base = format!("https://github.com/piperhex/remoteai/releases/download/cua-v{version}");
    for target in [
        "windows-x86_64.zip",
        "windows-arm64.zip",
        "darwin-universal-binary.tar.gz",
    ] {
        let url = format!("{base}/cua-driver-rs-{version}-{target}");
        assert!(Package::computer_use(version, &url, &"a".repeat(64)).is_some());
        for untrusted in [
            url.replace("piperhex/remoteai", "trycua/cua"),
            url.replace("cua-v", "v"),
            url.replace("cua-v0.37.0", "cua-v0.36.0"),
            format!("{url}?token=secret"),
        ] {
            assert!(Package::computer_use(version, &untrusted, &"a".repeat(64)).is_none());
        }
    }
}

fn package() -> Package {
    Package::codex(
        "1.0.0",
        CODEX_URL,
        &format!("sha256:{:x}", Sha256::digest(BYTES)),
        BYTES.len() as u64,
    )
    .unwrap()
}

fn service(path: &Path) -> Arc<Service> {
    Arc::new(Service {
        reporter: None,
        cache: Arc::new(Cache::new(path.into(), String::new())),
        broker: watch::channel(None).0,
        mirror_base: watch::channel(None).0,
        uploads: Arc::new(Semaphore::new(2)),
        downloads: Semaphore::new(1),
        policy: super::super::policy::Policy::testing(),
    })
}

#[test]
fn dependencies_require_trusted_urls_digests_versions_and_sizes() {
    let digest = format!("sha256:{:x}", Sha256::digest(BYTES));
    for url in [
        CODEX_URL.replace("openai", "other"),
        format!("{CODEX_URL}?token=secret"),
        CODEX_URL.replace("https:", "http:"),
        CODEX_URL.replace("github.com", "github.com.evil.test"),
    ] {
        assert!(Package::codex("1.0.0", &url, &digest, BYTES.len() as u64).is_none());
    }
    assert!(Package::codex("2.0.0", CODEX_URL, &digest, 1).is_none());
    assert!(Package::codex("1.0.0", CODEX_URL, "sha256:invalid", 1).is_none());
    assert!(Package::codex("1.0.0", CODEX_URL, &digest, 0).is_none());
    assert!(Package::codex(
        "1.0.0",
        CODEX_URL,
        &digest,
        super::super::MAX_PACKAGE_BYTES as u64 + 1
    )
    .is_none());
    let cli = package();
    cli.0.verify(BYTES, "").unwrap();
    assert!(cli.0.verify(b"untrusted dependency", "").is_err());
    let mut wrong_size = cli.0.clone();
    wrong_size.size += 1;
    assert!(wrong_size.verify(BYTES, "").is_err());
    let driver =
        Package::computer_use("1.0.0", DRIVER_URL, &format!("{:x}", Sha256::digest(BYTES)))
            .unwrap();
    driver.0.verify(BYTES, "").unwrap();
    assert_ne!(driver.0.id, cli.0.id);
    assert!(Package::computer_use("1.0.0", CODEX_URL, &"a".repeat(64)).is_none());
    assert!(Package::computer_use("2.0.0", DRIVER_URL, &"a".repeat(64)).is_none());
}

#[tokio::test]
async fn dependencies_reuse_restart_cache_and_reject_corruption_or_size_changes() {
    let root = tempfile::tempdir().unwrap();
    let service = service(root.path());
    let package = package();
    service
        .cache
        .save(package.0.clone(), Arc::new(BYTES.to_vec()))
        .await
        .unwrap();
    service.cache.restore().await.unwrap();
    let mut downloaded = 0;
    assert_eq!(
        shared(
            &service,
            &package.0,
            |length, _| downloaded += length,
            &mut None
        )
        .await
        .unwrap()
        .as_slice(),
        BYTES
    );
    assert_eq!(downloaded, BYTES.len());
    let mut wrong_size = package.0.clone();
    wrong_size.size += 1;
    assert!(shared(&service, &wrong_size, |_, _| {}, &mut None)
        .await
        .is_err());
    std::fs::write(
        root.path().join(format!("{}.pkg", package.0.id)),
        b"corrupted",
    )
    .unwrap();
    assert!(shared(&service, &package.0, |_, _| {}, &mut None)
        .await
        .is_err());
    assert!(service.cache.artifacts().is_empty());
}

#[tokio::test]
async fn unavailable_or_busy_sharing_leaves_origin_download_available() {
    let root = tempfile::tempdir().unwrap();
    let service = service(root.path());
    let package = package();
    assert!(shared(&service, &package.0, |_, _| {}, &mut None)
        .await
        .is_err());
    let (sender, mut receiver) = mpsc::channel(2);
    service.broker.send_replace(Some(sender));
    let permit = service.downloads.acquire().await.unwrap();
    assert!(shared(&service, &package.0, |_, _| {}, &mut None)
        .await
        .is_err());
    assert!(receiver.try_recv().is_err());
    drop(permit);
    let lookup = tokio::spawn(async move {
        let Some(Request::Find { reply, .. }) = receiver.recv().await else {
            panic!("expected lookup")
        };
        assert!(reply.send(Err(Error::Unavailable)).is_ok());
    });
    assert!(shared(&service, &package.0, |_, _| {}, &mut None)
        .await
        .is_err());
    lookup.await.unwrap();
}

#[path = "packages_peer_tests.rs"]
mod peer;

#[tokio::test]
async fn dependency_reports_wait_for_the_official_fallback_outcome() {
    for success in [true, false] {
        let root = tempfile::tempdir().unwrap();
        let mut service = service(root.path());
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
        let mut package = package();
        assert!(shared(&service, &package.0, |_, _| {}, &mut package.1)
            .await
            .is_err());
        assert!(
            reports.lock().unwrap().is_empty(),
            "fallback has not finished"
        );
        if success {
            package.complete_origin(BYTES.len());
        }
        drop(package);
        let reports = reports.lock().unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(
            reports[0]["outcome"],
            if success { "success" } else { "failed" }
        );
        assert_eq!(
            reports[0]["originBytes"],
            if success { BYTES.len() } else { 0 }
        );
    }
}
