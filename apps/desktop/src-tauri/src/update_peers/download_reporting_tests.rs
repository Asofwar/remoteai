use super::*;

#[tokio::test]
async fn disabled_sharing_does_not_create_a_spurious_failure() {
    let origin = Origin::start();
    let update = origin.update().await;
    let directory = tempfile::tempdir().unwrap();
    let mut service = service(directory.path(), &origin.key);
    Arc::get_mut(&mut service).unwrap().policy = crate::update_peers::policy::Policy::new();
    let reports = capture_reports(&mut service);
    resolve(&service, &update, &mut progress()).await.unwrap();
    let reports = reports.lock().unwrap();
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0]["outcome"], "success");
    assert_eq!(reports[0]["originBytes"], b"signed installer".len());
    assert!(reports[0]["failures"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn official_fallback_reports_one_final_success_and_cache_does_not_count_again() {
    let origin = Origin::start();
    let update = origin.update().await;
    let directory = tempfile::tempdir().unwrap();
    let mut service = service(directory.path(), &origin.key);
    let reports = capture_reports(&mut service);
    let package = resolve(&service, &update, &mut progress()).await.unwrap();
    assert_eq!(package.bytes.as_slice(), b"signed installer");
    resolve(&service, &update, &mut progress()).await.unwrap();
    let reports = reports.lock().unwrap();
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0]["outcome"], "success");
    assert_eq!(reports[0]["originBytes"], b"signed installer".len());
    assert_eq!(reports[0]["peerBytes"], 0);
    assert_eq!(reports[0]["failures"][0]["source"], "peer");
}

#[tokio::test]
async fn invalid_official_signature_settles_one_failed_report_without_caching() {
    let origin = Origin::start();
    let mut update = origin.update().await;
    update.signature = signed(b"a different installer").1;
    let directory = tempfile::tempdir().unwrap();
    let mut service = service(directory.path(), &origin.key);
    let reports = capture_reports(&mut service);
    assert!(resolve(&service, &update, &mut progress()).await.is_err());
    assert!(service.cache.artifacts().is_empty());
    let reports = reports.lock().unwrap();
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0]["outcome"], "failed");
    assert!(reports[0]["failures"]
        .as_array()
        .unwrap()
        .iter()
        .any(|failure| {
            failure["source"] == "origin"
                && failure["stage"] == "verify"
                && failure["code"] == "invalid"
        }));
}

#[tokio::test]
async fn failed_official_connection_settles_one_failed_report() {
    let origin = Origin::start();
    let mut update = origin.update().await;
    let unavailable = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    update.download_url = format!("http://{}/installer.exe", unavailable.local_addr().unwrap())
        .parse()
        .unwrap();
    drop(unavailable);
    let directory = tempfile::tempdir().unwrap();
    let mut service = service(directory.path(), &origin.key);
    let reports = capture_reports(&mut service);
    assert!(resolve(&service, &update, &mut progress()).await.is_err());
    let reports = reports.lock().unwrap();
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0]["outcome"], "failed");
    assert_eq!(reports[0]["originBytes"], 0);
}
