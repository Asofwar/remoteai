use super::*;
use crate::local_proxy::{
    credential_can_trigger_auto_switch, retry_upstream_request_with, TokenUsageAccount,
    UpstreamQuotaEvent,
};
use serde_json::json;
use std::{cell::Cell, time::Duration};

fn error_response(error: Value) -> UpstreamPayload {
    UpstreamPayload {
        status: 429,
        content_type: Some("application/json".to_string()),
        response_headers: Vec::new(),
        body: UpstreamBody::Buffered(serde_json::to_vec(&json!({ "error": error })).unwrap()),
        token_usage_service_tier: None,
        token_usage_account: Some(TokenUsageAccount {
            account_id: "exhausted".to_string(),
            account_email: String::new(),
            active_account_generation: 0,
            auto_switch_attempt_generation: 0,
            auto_switch_eligible: true,
            concurrent_request_started_at: None,
        }),
    }
}

#[test]
fn recognizes_explicit_quota_identifiers_in_type_and_code() {
    for field in ["type", "code"] {
        for identifier in [
            CODEX_USAGE_LIMIT_REACHED_ERROR_TYPE,
            INSUFFICIENT_QUOTA_ERROR_CODE,
        ] {
            let response = error_response(json!({ (field): identifier }));
            assert!(
                is_official_quota_exhaustion(&response),
                "{field}: {identifier}"
            );
        }
    }
}

#[test]
fn quota_code_is_recognized_when_error_type_is_generic() {
    let response = error_response(json!({
        "type": "invalid_request_error",
        "code": "insufficient_quota"
    }));
    assert!(is_official_quota_exhaustion(&response));
}

#[test]
fn transient_limits_and_message_mentions_do_not_trigger_quota_switches() {
    for error in [
        json!({ "type": "tokens", "code": "rate_limit_exceeded" }),
        json!({ "type": "rate_limit_error", "code": "rate_limit_reached" }),
        json!({ "message": "usage_limit_reached or insufficient_quota" }),
        json!({ "type": "usage_not_included" }),
        json!({ "type": null, "code": 429 }),
    ] {
        assert!(!is_official_quota_exhaustion(&error_response(error)));
    }
}

#[test]
fn quota_identifiers_still_require_http_429() {
    let mut response = error_response(json!({ "code": "usage_limit_reached" }));
    for status in [200, 400, 401, 403, 500] {
        response.status = status;
        assert!(!is_official_quota_exhaustion(&response), "status {status}");
    }
}

#[test]
fn quota_code_reaches_the_switch_callback_and_retries_the_request() {
    for identifier in [
        CODEX_USAGE_LIMIT_REACHED_ERROR_TYPE,
        INSUFFICIENT_QUOTA_ERROR_CODE,
    ] {
        let switched = Cell::new(false);
        let mut attempts = 0;
        let response = retry_upstream_request_with(
            Duration::from_secs(10),
            || {
                attempts += 1;
                assert!(attempts <= 2, "Quota error was retried without switching");
                let mut response = error_response(json!({ "code": identifier }));
                if switched.get() {
                    response.status = 200;
                }
                Ok(response)
            },
            |_, event| {
                assert!(matches!(event, UpstreamQuotaEvent::Retry { .. }));
                switched.set(true);
                true
            },
            |_| Duration::ZERO,
        )
        .unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(attempts, 2);
    }
}

#[test]
fn quota_code_does_not_make_a_fallback_credential_eligible_to_switch() {
    let mut response = error_response(json!({ "code": "insufficient_quota" }));
    let account = response.token_usage_account.as_mut().unwrap();
    account.auto_switch_eligible = false;
    assert!(!credential_can_trigger_auto_switch(account));
    assert!(is_official_quota_exhaustion(&response));
}

#[test]
fn unswitchable_quota_errors_preserve_body_and_headers_without_waiting() {
    let mut header_error = error_response(json!({ "message": "Quota exhausted" }));
    header_error.response_headers.push((
        CODEX_RATE_LIMIT_REACHED_TYPE_HEADER.to_string(),
        "workspace_member_usage_limit_reached".to_string(),
    ));
    for mut original in [
        error_response(json!({ "type": "usage_limit_reached" })),
        error_response(json!({ "code": "insufficient_quota" })),
        header_error,
    ] {
        // Provider responses can carry explicit quota errors without an official account.
        original.token_usage_account = None;
        original
            .response_headers
            .push(("retry-after".into(), "3600".into()));
        let expected_headers = original.response_headers.clone();
        let UpstreamBody::Buffered(expected_body) = &original.body else {
            panic!("Expected buffered quota error");
        };
        let expected_body = expected_body.clone();
        let mut original = Some(original);
        let response = retry_upstream_request_with(
            Duration::from_secs(60),
            || Ok(original.take().expect("Quota error must not be retried")),
            |_, _| panic!("No official account is available to switch or disable"),
            |_| panic!("Explicit quota errors must not wait for backoff"),
        )
        .unwrap();
        assert_eq!(response.status, 429);
        assert_eq!(response.content_type.as_deref(), Some("application/json"));
        assert_eq!(response.response_headers, expected_headers);
        let UpstreamBody::Buffered(body) = response.body else {
            panic!("Expected original buffered quota error");
        };
        assert_eq!(body, expected_body);
    }
}
