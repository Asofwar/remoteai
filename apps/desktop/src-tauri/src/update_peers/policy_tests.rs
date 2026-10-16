use super::*;

#[tokio::test]
async fn startup_disables_sharing_and_prefetch_until_the_server_policy_arrives() {
    let policy = Policy::new();
    assert_eq!(policy.preferences(), Preferences::default());
    assert_eq!(policy.preferences().scope, SharingScope::Off);
    assert!(!policy.preferences().prepare_android);
    assert!(policy.preferences().unmetered_only);
    assert!(!policy.allows_network());
    assert!(!policy.allows_download());
    assert!(!policy.allows_upload());
    assert!(policy.throttle(1024).await.is_err());
    policy.unmetered.store(true, Ordering::Relaxed);
    assert!(!policy.allows_upload());
    assert_eq!(policy.metrics.uploaded_bytes.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn an_explicit_server_policy_can_enable_unlimited_metered_sharing() {
    let policy = Policy::new();
    policy.select_server(Some("test-server".into()));
    policy
        .apply(
            "test-server",
            Preferences {
                scope: SharingScope::Everyone,
                upload_kib_per_second: 0,
                unmetered_only: false,
                prepare_android: true,
            },
        )
        .await
        .unwrap();
    assert!(policy.allows_upload());
    tokio::time::timeout(
        Duration::from_millis(100),
        policy.throttle(1024 * 1024 * 1024),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(
        policy.metrics.uploaded_bytes.load(Ordering::Relaxed),
        1024 * 1024 * 1024
    );
}

#[tokio::test]
async fn global_policy_controls_scope_network_and_android_preparation() {
    let policy = Policy::new();
    policy.select_server(Some("test-server".into()));
    policy
        .apply(
            "test-server",
            Preferences {
                scope: SharingScope::Own,
                unmetered_only: true,
                prepare_android: false,
                ..Preferences::default()
            },
        )
        .await
        .unwrap();
    assert!(policy.allows_download());
    assert!(!policy.allows_upload());
    assert!(!policy.preferences().prepare_android);
    policy.unmetered.store(true, Ordering::Relaxed);
    assert!(policy.allows_upload());
    policy
        .apply(
            "test-server",
            Preferences {
                scope: SharingScope::Off,
                ..Preferences::default()
            },
        )
        .await
        .unwrap();
    assert!(!policy.allows_download());
    assert!(policy.throttle(1).await.is_err());
    assert!(policy
        .apply(
            "test-server",
            Preferences {
                upload_kib_per_second: 1,
                ..Preferences::default()
            }
        )
        .await
        .is_err());
    assert_eq!(policy.preferences().scope, SharingScope::Off);
}

#[tokio::test]
async fn changing_limits_or_disabling_sharing_interrupts_throttled_uploads() {
    for scope in [SharingScope::Everyone, SharingScope::Off] {
        let policy = Policy::testing();
        policy
            .apply(
                "test-server",
                Preferences {
                    scope: SharingScope::Everyone,
                    upload_kib_per_second: 64,
                    ..Preferences::default()
                },
            )
            .await
            .unwrap();
        let worker = policy.clone();
        let pending = tokio::spawn(async move { worker.throttle(1024 * 1024).await });
        tokio::task::yield_now().await;
        assert!(!pending.is_finished());
        policy
            .apply(
                "test-server",
                Preferences {
                    scope,
                    upload_kib_per_second: 0,
                    ..Preferences::default()
                },
            )
            .await
            .unwrap();
        let result = tokio::time::timeout(Duration::from_secs(1), pending)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(result.is_ok(), scope == SharingScope::Everyone);
    }
}

#[tokio::test]
async fn scope_changes_interrupt_transfers_without_a_signaling_connection() {
    let policy = Policy::testing();
    let worker = policy.clone();
    let pending = tokio::spawn(async move { worker.scope_changed(SharingScope::Everyone).await });
    policy
        .apply(
            "test-server",
            Preferences {
                scope: SharingScope::Own,
                ..Preferences::default()
            },
        )
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(1), pending)
        .await
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn changing_servers_or_signing_out_rejects_an_in_flight_old_policy() {
    for server in [Some("new-server".to_owned()), None] {
        let policy = Policy::testing();
        let settings = policy.preferences();
        let upload_lock = policy.next_upload.lock().await;
        let worker = policy.clone();
        let refresh = tokio::spawn(async move { worker.apply("test-server", settings).await });
        tokio::task::yield_now().await;
        assert!(!refresh.is_finished());

        policy.select_server(server);
        assert_eq!(policy.preferences(), Preferences::default());
        assert!(!policy.allows_upload());
        drop(upload_lock);
        assert!(refresh.await.unwrap().is_err());
        assert_eq!(policy.preferences(), Preferences::default());
    }
}

#[test]
fn reconnecting_to_the_same_server_preserves_its_valid_policy() {
    let policy = Policy::testing();
    let settings = policy.preferences();
    policy.select_server(Some("test-server".into()));
    assert_eq!(policy.preferences(), settings);
}
