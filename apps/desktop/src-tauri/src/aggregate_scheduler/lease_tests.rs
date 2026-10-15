use super::*;
use std::sync::{Arc, Barrier};

fn seed_recovery(aggregate_id: &str) -> AggregateFailoverPolicy {
    let policy = AggregateFailoverPolicy {
        failure_threshold: 1,
        ..Default::default()
    };
    let members = ["a".to_string(), "b".to_string()];
    with_scheduler(|scheduler| {
        let now = Instant::now() - Duration::from_secs(10);
        let token = scheduler.select_at(
            &SelectionOptions {
                aggregate_id,
                session_id: None,
                member_ids: &members,
                excluded: &HashSet::new(),
                policy: &policy,
            },
            now,
        )?;
        scheduler.finish_at(
            token,
            MemberOutcome::Failure { retry_after: None },
            &policy,
            now,
        );
        Ok(())
    })
    .unwrap();
    policy
}

#[test]
fn concurrent_callers_share_exactly_one_probe_reservation() {
    const CALLERS: usize = 8;
    let aggregate_id = "scheduler-concurrent-probe-test";
    let policy = seed_recovery(aggregate_id);
    let barrier = Arc::new(Barrier::new(CALLERS));
    let requests = (0..CALLERS)
        .map(|_| {
            let policy = policy.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                select_member(SelectionOptions {
                    aggregate_id,
                    session_id: None,
                    member_ids: &["a".to_string(), "b".to_string()],
                    excluded: &HashSet::new(),
                    policy: &policy,
                })
                .unwrap()
            })
        })
        .collect::<Vec<_>>();
    let leases = requests
        .into_iter()
        .map(|request| request.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        leases
            .iter()
            .filter(|lease| lease.member_id() == "a")
            .count(),
        1
    );
    for lease in leases {
        lease.finish(MemberOutcome::Success);
    }
    assert_eq!(
        member_states(aggregate_id, &["a".to_string()]).unwrap()["a"].state,
        MemberState::Healthy
    );
    reset(aggregate_id);
}

#[test]
fn dropping_recovery_lease_releases_it_without_restoring_health() {
    let aggregate_id = "scheduler-dropped-probe-test";
    let policy = seed_recovery(aggregate_id);
    let members = ["a".to_string(), "b".to_string()];
    let lease = select_member(SelectionOptions {
        aggregate_id,
        session_id: None,
        member_ids: &members,
        excluded: &HashSet::new(),
        policy: &policy,
    })
    .unwrap();
    assert_eq!(lease.member_id(), "a");
    assert_eq!(
        member_states(aggregate_id, &members).unwrap()["a"].state,
        MemberState::Recovering
    );
    drop(lease);
    let snapshot = member_states(aggregate_id, &members).unwrap();
    assert_eq!(snapshot["a"].state, MemberState::CoolingDown);
    assert_eq!(snapshot["a"].consecutive_failures, 1);
    assert!((1..=5).contains(&snapshot["a"].retry_after_seconds));
    reset(aggregate_id);
}
