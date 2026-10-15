use super::*;

#[tokio::test]
async fn defaults_enable_all_sharing_without_a_network_or_speed_limit() {
    let policy = Policy::new();
    assert_eq!(policy.preferences(), Preferences::default());
    assert_eq!(policy.preferences().scope, SharingScope::Everyone);
    assert!(policy.preferences().prepare_android);
    assert!(!policy.preferences().unmetered_only);
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
    policy
        .apply(Preferences {
            scope: SharingScope::Own,
            unmetered_only: true,
            prepare_android: false,
            ..Preferences::default()
        })
        .await
        .unwrap();
    assert!(policy.allows_download());
    assert!(!policy.allows_upload());
    assert!(!policy.preferences().prepare_android);
    policy.unmetered.store(true, Ordering::Relaxed);
    assert!(policy.allows_upload());
    policy
        .apply(Preferences {
            scope: SharingScope::Off,
            ..Preferences::default()
        })
        .await
        .unwrap();
    assert!(!policy.allows_download());
    assert!(policy.throttle(1).await.is_err());
    assert!(policy
        .apply(Preferences {
            upload_kib_per_second: 1,
            ..Preferences::default()
        })
        .await
        .is_err());
    assert_eq!(policy.preferences().scope, SharingScope::Off);
}

#[tokio::test]
async fn changing_limits_or_disabling_sharing_interrupts_throttled_uploads() {
    for scope in [SharingScope::Everyone, SharingScope::Off] {
        let policy = Policy::testing();
        policy
            .apply(Preferences {
                upload_kib_per_second: 64,
                ..Preferences::default()
            })
            .await
            .unwrap();
        let worker = policy.clone();
        let pending = tokio::spawn(async move { worker.throttle(1024 * 1024).await });
        tokio::task::yield_now().await;
        assert!(!pending.is_finished());
        policy
            .apply(Preferences {
                scope,
                ..Preferences::default()
            })
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
        .apply(Preferences {
            scope: SharingScope::Own,
            ..Preferences::default()
        })
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(1), pending)
        .await
        .unwrap()
        .unwrap();
}
