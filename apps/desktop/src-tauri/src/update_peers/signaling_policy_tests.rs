use super::*;
use crate::update_peers::policy::Policy;
use tokio::sync::{watch, Semaphore};

fn bridge() -> (Bridge, tempfile::TempDir) {
    let directory = tempfile::tempdir().unwrap();
    let service = Arc::new(Service {
        cache: Arc::new(cache::Cache::new(directory.path().into(), String::new())),
        broker: watch::channel(None).0,
        mirror_base: watch::channel(None).0,
        uploads: Arc::new(Semaphore::new(2)),
        downloads: Semaphore::new(1),
        policy: Policy::new(),
    });
    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    app.manage(service);
    (Bridge::new(app.handle()), directory)
}

#[tokio::test]
async fn changing_the_bridge_server_or_signing_out_clears_the_old_policy() {
    let (mut bridge, _directory) = bridge();
    let first_server = "wss://first.example/api/device-switch";
    bridge.server(first_server);
    let first_base = bridge.service.mirror_base.borrow().clone().unwrap();
    let settings = Policy::testing().preferences();
    bridge
        .service
        .policy
        .apply(&first_base, settings.clone())
        .await
        .unwrap();

    bridge.disconnected();
    bridge.server(first_server);
    assert_eq!(bridge.service.policy.preferences(), settings);
    bridge.server("wss://second.example/api/device-switch");
    assert!(!bridge.service.policy.allows_download());
    assert!(!bridge.service.policy.preferences().prepare_android);
    assert!(bridge
        .service
        .policy
        .apply(&first_base, settings.clone())
        .await
        .is_err());

    let second_base = bridge.service.mirror_base.borrow().clone().unwrap();
    bridge
        .service
        .policy
        .apply(&second_base, settings.clone())
        .await
        .unwrap();
    bridge.signed_out();
    assert!(bridge.service.mirror_base.borrow().is_none());
    assert!(!bridge.service.policy.allows_upload());
    assert!(!bridge.service.policy.allows_download());
    assert!(!bridge.service.policy.preferences().prepare_android);
    assert!(bridge
        .service
        .policy
        .apply(&second_base, settings)
        .await
        .is_err());
}
