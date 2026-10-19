#[test]
fn quota_switch_retries_before_the_minimum_429_timeout() {
    let mut requests = 0;
    let mut events = Vec::new();
    let mut waits = Vec::new();
    let timeout = Duration::from_secs(MIN_UPSTREAM_429_RETRY_TIMEOUT_SECONDS);
    let response = retry_upstream_request_with(
        timeout,
        || {
            requests += 1;
            Ok(official_payload(if requests == 1 { 429 } else { 200 }, 0))
        },
        |_, event| {
            events.push(event.clone());
            matches!(event, UpstreamQuotaEvent::Retry { .. })
        },
        |delay| {
            waits.push(delay);
            timeout
        },
    )
    .unwrap();

    assert_eq!(response.status, 200);
    assert_eq!(requests, 2);
    assert_eq!(events.len(), 1);
    assert!(matches!(events[0], UpstreamQuotaEvent::Retry { .. }));
    assert!(
        waits.is_empty(),
        "confirmed quota must switch before backoff"
    );
}

#[test]
fn quota_switch_still_retries_after_transient_429_used_the_retry_budget() {
    let mut requests = 0;
    let mut switches = 0;
    let mut waits = Vec::new();
    let response = retry_upstream_request_with(
        Duration::from_secs(2),
        || {
            requests += 1;
            let mut response = official_payload(if requests <= 2 { 429 } else { 200 }, 0);
            if requests == 1 {
                response.body = UpstreamBody::Buffered(
                    br#"{"error":{"code":"rate_limit_exceeded","type":"tokens"}}"#.to_vec(),
                );
            }
            Ok(response)
        },
        |_, event| {
            assert!(matches!(event, UpstreamQuotaEvent::Retry { .. }));
            switches += 1;
            true
        },
        |delay| {
            waits.push(delay);
            Duration::from_secs(waits.len() as u64)
        },
    )
    .unwrap();

    assert_eq!(response.status, 200);
    assert_eq!(requests, 3);
    assert_eq!(switches, 1);
    assert_eq!(waits, [Duration::from_secs(1)]);
}

#[test]
fn unsuccessful_quota_switch_returns_the_original_error_without_backoff() {
    let mut requests = 0;
    let mut switches = 0;
    let mut timeouts = 0;
    let timeout = Duration::from_secs(1);
    let response = retry_upstream_request_with(
        timeout,
        || {
            requests += 1;
            Ok(official_payload(429, 0))
        },
        |_, event| {
            match event {
                UpstreamQuotaEvent::Retry { .. } => switches += 1,
                UpstreamQuotaEvent::RetryTimedOut => timeouts += 1,
            }
            false
        },
        |_| panic!("Confirmed exhaustion without a switch must return immediately"),
    )
    .unwrap();

    assert_eq!(response.status, 429);
    assert!(is_official_quota_exhaustion(&response));
    assert_eq!((requests, switches, timeouts), (1, 1, 0));
}

#[test]
fn repeated_exhausted_accounts_stop_without_backoff_or_a_retry_timeout() {
    let mut requests = 0;
    let mut switched_accounts = Vec::new();
    let mut timeouts = 0;
    let timeout = Duration::from_secs(1);
    let response = retry_upstream_request_with(
        timeout,
        || {
            requests += 1;
            assert!(requests <= 3, "exhausted accounts must not cycle forever");
            let mut response = official_payload(429, requests);
            response.token_usage_account.as_mut().unwrap().account_id =
                if requests == 2 { "backup" } else { "current" }.to_string();
            Ok(response)
        },
        |response, event| {
            match event {
                UpstreamQuotaEvent::Retry { .. } => switched_accounts.push(
                    response
                        .token_usage_account
                        .as_ref()
                        .unwrap()
                        .account_id
                        .clone(),
                ),
                UpstreamQuotaEvent::RetryTimedOut => timeouts += 1,
            }
            true
        },
        |_| panic!("Repeated exhausted accounts must return the quota error immediately"),
    )
    .unwrap();

    assert_eq!(response.status, 429);
    assert_eq!(requests, 3);
    assert_eq!(switched_accounts, ["current", "backup"]);
    assert_eq!(timeouts, 0);
}

#[test]
fn image_quota_retry_requires_a_successful_account_switch() {
    for (account_ids, healthy_account, expected_status, expected_attempts) in [
        (vec!["a"], None, 429, vec!["a"]),
        (vec!["a", "b"], Some("b"), 200, vec!["a", "b"]),
        (vec!["a", "b"], None, 429, vec!["a", "b", "a"]),
    ] {
        let mut pool = ImageAccountPool::new(account_ids.into_iter().map(String::from).collect());
        let switched = std::cell::Cell::new(false);
        let mut attempts = Vec::new();
        let response = retry_upstream_request_with(
            Duration::from_secs(60),
            || {
                let account_id = pool.as_ref().unwrap().current_account_id().to_string();
                attempts.push(account_id.clone());
                assert!(attempts.len() <= expected_attempts.len());
                let status = if healthy_account == Some(account_id.as_str()) {
                    200
                } else {
                    429
                };
                let mut response = official_payload(status, 0);
                let account = response.token_usage_account.as_mut().unwrap();
                account.account_id = account_id;
                account.auto_switch_eligible = false;
                switched.set(advance_image_account_after_429(&mut pool, &response));
                Ok(response)
            },
            |_, event| {
                assert!(matches!(event, UpstreamQuotaEvent::Retry { .. }));
                switched.get()
            },
            |_| panic!("Image quota must either switch immediately or return the error"),
        )
        .unwrap();
        assert_eq!(response.status, expected_status);
        assert_eq!(attempts, expected_attempts);
    }
}

fn stale_positive_quota_accounts() -> Vec<AccountSummary> {
    vec![
        account_with_usage("a", 1.0, 90.0),
        account_with_usage("b", 2.0, 90.0),
        account_with_usage("c", 80.0, 90.0),
    ]
}

fn next_stale_quota_target(current_id: &str, exhausted_account_ids: &HashSet<String>) -> String {
    let mut accounts = stale_positive_quota_accounts();
    retain_untried_auto_switch_accounts(&mut accounts, exhausted_account_ids);
    if let Some(target) =
        account_with_lowest_remaining_primary_quota(&accounts, current_id, false, false, 0.0)
    {
        return target.id.clone();
    }
    assert!(all_backup_accounts_have_exhausted_quota(
        &accounts, current_id, false, 0.0
    ));
    "provider".to_string()
}

fn retry_with_stale_positive_quota(successful_account: Option<&str>) -> Vec<String> {
    let active_account = std::cell::RefCell::new("a".to_string());
    let mut forwarded_accounts = Vec::new();
    let response = retry_upstream_request_with(
        Duration::ZERO,
        || {
            let account_id = active_account.borrow().clone();
            forwarded_accounts.push(account_id.clone());
            assert!(
                forwarded_accounts.len() <= 4,
                "failed accounts must not repeat"
            );
            if successful_account == Some(account_id.as_str()) || account_id == "provider" {
                return Ok(json_payload(200, json!({ "id": "success" })));
            }
            let mut response = official_payload(429, 0);
            response.token_usage_account.as_mut().unwrap().account_id = account_id;
            Ok(response)
        },
        |response, event| {
            let UpstreamQuotaEvent::Retry {
                exhausted_account_ids,
            } = event
            else {
                panic!("confirmed quota failures must advance to an untried target");
            };
            let failed_account = &response.token_usage_account.as_ref().unwrap().account_id;
            active_account.replace(next_stale_quota_target(
                failed_account,
                &exhausted_account_ids,
            ));
            true
        },
        |_| panic!("untried quota targets should be attempted before backoff"),
    )
    .unwrap();
    assert_eq!(response.status, 200);
    forwarded_accounts
}

#[test]
fn stale_positive_quota_on_failed_accounts_does_not_hide_a_healthy_third_account() {
    assert_eq!(retry_with_stale_positive_quota(Some("c")), ["a", "b", "c"]);
}

#[test]
fn known_quota_failures_do_not_block_provider_fallback_with_stale_positive_usage() {
    assert_eq!(
        retry_with_stale_positive_quota(None),
        ["a", "b", "c", "provider"]
    );
}

#[test]
fn untried_account_with_unknown_usage_still_blocks_provider_fallback() {
    let mut accounts = stale_positive_quota_accounts();
    accounts[2].usage.error = Some("usage unavailable".to_string());
    let exhausted_account_ids = HashSet::from(["a".to_string(), "b".to_string()]);
    retain_untried_auto_switch_accounts(&mut accounts, &exhausted_account_ids);
    assert!(
        account_with_lowest_remaining_primary_quota(&accounts, "b", false, false, 0.0).is_none()
    );
    assert!(!all_backup_accounts_have_exhausted_quota(
        &accounts, "b", false, 0.0
    ));
}

#[test]
fn failed_switch_records_quota_exhaustion_before_callback_without_excluding_transient_limits() {
    let mut quota_retry = QuotaRetryState::default();
    let mut response = official_payload(429, 0);
    response.token_usage_account.as_mut().unwrap().account_id = "a".to_string();
    assert!(!switch_exhausted_account(
        &response,
        &mut quota_retry,
        &mut |_, event| {
            let UpstreamQuotaEvent::Retry {
                exhausted_account_ids,
            } = event
            else {
                panic!("unexpected timeout")
            };
            assert_eq!(exhausted_account_ids, HashSet::from(["a".to_string()]));
            false
        }
    ));
    assert!(quota_retry.switched_account_ids.is_empty());

    response.token_usage_account.as_mut().unwrap().account_id = "b".to_string();
    response.body = UpstreamBody::Buffered(br#"{"error":{"type":"tokens"}}"#.to_vec());
    assert!(!switch_exhausted_account(
        &response,
        &mut quota_retry,
        &mut |_, _| { panic!("transient limits must not be excluded") }
    ));
    assert_eq!(
        quota_retry.exhausted_account_ids,
        HashSet::from(["a".to_string()])
    );

    response.body = UpstreamBody::Buffered(br#"{"error":{"type":"usage_limit_reached"}}"#.to_vec());
    assert!(switch_exhausted_account(
        &response,
        &mut quota_retry,
        &mut |_, event| {
            let UpstreamQuotaEvent::Retry {
                exhausted_account_ids,
            } = event
            else {
                panic!("unexpected timeout")
            };
            assert_eq!(
                exhausted_account_ids,
                HashSet::from(["a".to_string(), "b".to_string()])
            );
            true
        }
    ));
}
