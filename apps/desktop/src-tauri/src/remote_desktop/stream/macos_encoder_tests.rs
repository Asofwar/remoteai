use super::*;
use crate::remote_desktop::displays::{Bounds, DisplayInfo};
use std::os::unix::fs::PermissionsExt;

const FIXTURE_START_TIMEOUT: Duration = Duration::from_secs(30);
const CONTROL_TIMEOUT: Duration = Duration::from_secs(5);

fn fixture() -> (tempfile::TempDir, Monitor, Profile) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("encoder");
    // Echo each live control as a framed payload to verify the real pipe protocol without screen access.
    std::fs::write(
        &path,
        r"#!/usr/bin/python3
import struct, sys
output = sys.stdout.buffer
output.write(struct.pack('<I', 4) + b'CSW2')
output.write(struct.pack('<I', 5) + b'READY')
output.flush()
while True:
    control = sys.stdin.buffer.read(12)
    if len(control) != 12: break
    output.write(struct.pack('<I', len(control)) + control)
    output.flush()
",
    )
    .unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
    let display = Monitor {
        info: DisplayInfo {
            id: "macos:1".into(),
            name: "Retina".into(),
            width: 3840,
            height: 2160,
            primary: true,
        },
        handle: 1,
        bounds: Bounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        },
    };
    let profile = Profile {
        codec: super::super::codec::VideoCodec::H264,
        adaptive_fps: false,
        adaptive_resolution: false,
        width: 2560,
        fps: 30,
        bitrate: 12_000_000,
    };
    (directory, display, profile)
}

async fn wait_for_fixture_startup(encoder: &mut Encoder) {
    // Interpreter cold starts on shared runners are separate from live-control latency.
    // Keep the shorter response deadline once the fixture has negotiated its protocol.
    let ready = tokio::time::timeout(FIXTURE_START_TIMEOUT, encoder.next())
        .await
        .expect("encoder fixture did not start")
        .expect("encoder fixture closed before startup");
    assert_eq!(ready, b"READY");
    assert!(encoder.packets.controllable);
}

#[tokio::test]
async fn high_frame_rate_updates_keep_the_same_helper_and_send_the_requested_controls() {
    let (directory, display, profile) = fixture();
    let mut encoder = Encoder::spawn(&directory.path().join("encoder"), profile, &display).unwrap();
    wait_for_fixture_startup(&mut encoder).await;
    assert_eq!((encoder.width, encoder.height), (2560, 1440));
    let process = encoder.child.id();
    for fps in [60, 90, 144, 30] {
        let changed = Profile { fps, ..profile };
        assert!(encoder.update(changed).await.unwrap());
        assert_eq!(encoder.child.id(), process);
        let control = tokio::time::timeout(CONTROL_TIMEOUT, encoder.next())
            .await
            .expect("encoder fixture did not acknowledge a live control")
            .expect("encoder fixture closed before acknowledging a live control");
        assert_eq!(&control[..4], &0x3257_5343_u32.to_le_bytes());
        assert_eq!(&control[4..8], &profile.bitrate.to_le_bytes());
        assert_eq!(&control[8..], &fps.to_le_bytes());
        assert_eq!(encoder.profile.fps, fps);
    }
    // A size change still needs a new encoder surface; it must not send incompatible live controls.
    assert!(!encoder
        .update(Profile {
            width: 1920,
            ..profile
        })
        .await
        .unwrap());
    encoder.stop().await;
    assert!(!encoder.update(profile).await.unwrap());
}
