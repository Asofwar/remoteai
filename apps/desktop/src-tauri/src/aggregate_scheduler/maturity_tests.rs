use super::*;
use crate::aggregate_failover::AggregateRoutingStrategy;

#[test]
fn priority_uses_backups_only_when_needed_and_preserves_healthy_conversations() {
    let mut scenario = Scenario::new();
    scenario.policy.routing_strategy = AggregateRoutingStrategy::Priority;
    scenario.policy.failure_threshold = 1;
    for session in ["one", "two", "three"] {
        assert_eq!(scenario.select(session).member_id, "a");
    }
    let first = scenario.select("one");
    scenario.fail(first);
    assert_eq!(scenario.select("one").member_id, "b");
    assert_eq!(scenario.select("four").member_id, "b");
    scenario.now += Duration::from_secs(5);
    assert_eq!(scenario.select("one").member_id, "b");
    let probe = scenario.select("new");
    assert_eq!(probe.member_id, "a");
    scenario.finish(probe, MemberOutcome::Success);
    assert_eq!(scenario.select("latest").member_id, "a");
}

#[test]
fn recovery_requires_consecutive_successful_exclusive_probes() {
    let mut scenario = Scenario::new();
    scenario.policy.recovery_success_threshold = 3;
    scenario.open_first_member();
    scenario.now += Duration::from_secs(5);
    for session in ["probe-one", "probe-two"] {
        let probe = scenario.select(session);
        assert_eq!(probe.member_id, "a");
        assert_ne!(scenario.select("parallel").member_id, "a");
        scenario.finish(probe, MemberOutcome::Success);
        assert_eq!(scenario.snapshot("a").state, MemberState::Recovering);
    }
    let probe = scenario.select("failed-probe");
    scenario.fail(probe);
    assert_eq!(scenario.snapshot("a").state, MemberState::CoolingDown);
    scenario.now += Duration::from_secs(10);
    for index in 1..=3 {
        let probe = scenario.select(&format!("retry-probe-{index}"));
        assert_eq!(probe.member_id, "a");
        scenario.finish(probe, MemberOutcome::Success);
        assert_eq!(
            scenario.snapshot("a").state,
            if index == 3 {
                MemberState::Healthy
            } else {
                MemberState::Recovering
            }
        );
    }
}

#[test]
fn error_rate_catches_intermittent_failures_only_after_enough_samples() {
    let mut scenario = Scenario::new();
    scenario.members = vec!["a".into()];
    scenario.policy.failure_threshold = 10;
    scenario.policy.error_rate_threshold_percent = Some(50);
    scenario.policy.error_rate_min_requests = 4;
    for outcome in [
        MemberOutcome::Success,
        MemberOutcome::Failure { retry_after: None },
        MemberOutcome::Success,
    ] {
        let request = scenario.select("one");
        scenario.finish(request, outcome);
        assert_eq!(scenario.snapshot("a").state, MemberState::Healthy);
    }
    let neutral = scenario.select("one");
    scenario.finish(neutral, MemberOutcome::Neutral);
    let request = scenario.select("one");
    scenario.fail(request);
    assert_eq!(scenario.snapshot("a").state, MemberState::CoolingDown);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 1);
}

#[test]
fn error_rate_forgets_outcomes_outside_the_bounded_window() {
    let mut scenario = Scenario::new();
    scenario.members = vec!["a".into()];
    scenario.policy.failure_threshold = 10;
    for _ in 0..4 {
        let request = scenario.select("one");
        scenario.fail(request);
    }
    scenario.policy.error_rate_threshold_percent = Some(4);
    scenario.policy.error_rate_min_requests = 10;
    for _ in 0..100 {
        let request = scenario.select("one");
        scenario.finish(request, MemberOutcome::Success);
    }
    let request = scenario.select("one");
    scenario.fail(request);
    assert_eq!(scenario.snapshot("a").state, MemberState::Healthy);
}

#[test]
fn concurrent_successes_count_toward_error_rate_without_clearing_newer_failures() {
    let mut scenario = Scenario::new();
    scenario.members = vec!["a".into()];
    scenario.policy.failure_threshold = 10;
    scenario.policy.error_rate_threshold_percent = Some(50);
    scenario.policy.error_rate_min_requests = 2;
    let pending = (0..8).map(|_| scenario.select("one")).collect::<Vec<_>>();
    let failed = scenario.select("one");
    scenario.fail(failed);
    for request in pending {
        scenario.finish(request, MemberOutcome::Success);
    }
    assert_eq!(scenario.snapshot("a").consecutive_failures, 1);
    let failed = scenario.select("one");
    scenario.fail(failed);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 2);
    assert_eq!(scenario.snapshot("a").state, MemberState::Healthy);
}
