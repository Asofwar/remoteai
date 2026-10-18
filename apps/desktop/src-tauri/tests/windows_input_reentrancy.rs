//! Exercise the actual Tao window procedure; a deadlock must fail without hanging CI.
#![cfg(windows)]

#[path = "windows_input/fixture.rs"]
mod fixture;
#[path = "windows_input/scenarios.rs"]
mod scenarios;

use std::{
    process::Command,
    thread,
    time::{Duration, Instant},
};

const CHILD_CASE: &str = "REMOTEAI_INPUT_REENTRANCY_CASE";
const CHILD_TIMEOUT: Duration = Duration::from_secs(20);

#[test]
fn windows_input_remains_responsive_during_focus_reentry() {
    if let Ok(case) = std::env::var(CHILD_CASE) {
        scenarios::run(&case);
        return;
    }
    for case in [
        "keyup",
        "syskeyup",
        "keydown",
        "syskeydown",
        "char",
        "syschar",
        "ime",
        "text",
    ] {
        run_child(case);
    }
}

fn run_child(case: &str) {
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "windows_input_remains_responsive_during_focus_reentry",
            "--nocapture",
        ])
        .env(CHILD_CASE, case)
        .spawn()
        .unwrap();
    let deadline = Instant::now() + CHILD_TIMEOUT;
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            assert!(status.success(), "input scenario {case} failed: {status}");
            break;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            child.wait().unwrap();
            panic!("input scenario {case} deadlocked (exceeded {CHILD_TIMEOUT:?})");
        }
        thread::sleep(Duration::from_millis(20));
    }
}
