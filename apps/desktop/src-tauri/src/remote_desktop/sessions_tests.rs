use super::*;
use crate::remote_desktop::{
    displays::{Bounds, DisplayInfo},
    monitors::Monitor,
};

fn session(display: &str, group: Option<&str>) -> Session {
    Session {
        id: format!("lease-{display}"),
        capture_group: group.map(String::from),
        permissions: Default::default(),
        touched: Instant::now(),
        deadline: Instant::now() + Duration::from_secs(60),
        clipboard: None,
        clipboard_revision: None,
        privacy: None,
        input: Default::default(),
        display: Monitor {
            handle: 0,
            info: DisplayInfo {
                id: display.into(),
                name: display.into(),
                width: 1920,
                height: 1080,
                primary: true,
            },
            bounds: Bounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
        },
    }
}

#[test]
fn only_distinct_displays_in_the_same_host_group_can_coexist() {
    let first = session("first", Some("viewer-a"));
    let mut sessions = HashMap::from([(first.id.clone(), first)]);
    assert!(may_join(&sessions, Some("viewer-a"), "second"));
    assert!(!may_join(&sessions, Some("viewer-a"), "first"));
    assert!(!may_join(&sessions, Some("viewer-b"), "second"));
    assert!(!may_join(&sessions, None, "second"));
    let second = session("second", Some("viewer-a"));
    sessions.insert(second.id.clone(), second);
    sessions.remove("lease-first");
    assert!(may_join(&sessions, Some("viewer-a"), "first"));
    assert!(!may_join(&sessions, Some("viewer-b"), "first"));
}

#[test]
fn expired_leases_do_not_block_new_viewers_and_legacy_leases_remain_exclusive() {
    let mut first = session("first", None);
    let mut sessions = HashMap::new();
    sessions.insert(first.id.clone(), session("first", None));
    assert!(!may_join(&sessions, Some("viewer"), "second"));
    first.touched = Instant::now() - LEASE - Duration::from_secs(1);
    sessions.insert(first.id.clone(), first);
    assert!(may_join(&sessions, Some("viewer"), "second"));
    let mut second = session("second", Some("viewer"));
    second.deadline = Instant::now() - Duration::from_secs(1);
    sessions.insert(second.id.clone(), second);
    assert!(may_join(&sessions, None, "first"));
}
