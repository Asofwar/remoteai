use super::{start_bridge, *};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires two unlocked Windows displays, prepared video runtime and Edge"]
async fn visited_displays_keep_native_connections_at_one_background_frame_per_second() {
    let displays = super::super::super::monitors::list().unwrap();
    assert!(displays.len() >= 2, "two connected displays required");
    let group = uuid::Uuid::new_v4().to_string();
    let mut bridges = Vec::new();
    let mut endpoints = Vec::new();
    for display in displays.iter().take(2) {
        let opened = super::super::super::open(
            Some(display.info.id.clone()),
            Default::default(),
            None,
            Some(group.clone()),
        )
        .unwrap();
        let request = OpenRequest {
            id: opened.id.clone(),
            relay_standby: false,
            clipboard_channel: false,
            ice_servers: vec![],
            profile: Profile {
                codec: Default::default(),
                adaptive_fps: false,
                adaptive_resolution: false,
                width: 1280,
                fps: 30,
                bitrate: 2_000_000,
            },
        };
        let resources = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let offer = super::super::open_at(resources, request).await.unwrap();
        let stream = super::super::current(&opened.id).await.unwrap();
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").unwrap());
        let endpoint = format!("http://{}", server.server_addr());
        let token = uuid::Uuid::new_v4().to_string();
        let stopped = Arc::new(AtomicBool::new(false));
        let worker = start_bridge(
            server,
            stream.clone(),
            offer,
            (token.clone(), stopped.clone()),
        );
        endpoints.push(serde_json::json!({"endpoint":endpoint, "token":token}));
        bridges.push((stream, stopped, worker));
    }
    let script =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../e2e/native-desktop-displays.mjs");
    let result = tokio::process::Command::new("node")
        .arg(script)
        .env(
            "CSW_NATIVE_DISPLAY_ENDPOINTS",
            serde_json::to_string(&endpoints).unwrap(),
        )
        .output()
        .await;
    for (stream, stopped, worker) in bridges {
        stopped.store(true, Ordering::Relaxed);
        super::super::remote_desktop_stream_close(stream.id.clone())
            .await
            .unwrap();
        worker.join().unwrap();
    }
    let output = result.unwrap();
    println!("{}", String::from_utf8_lossy(&output.stdout));
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
