use std::{sync::Arc, time::Duration};

use easytier::instance::factory::NativeCoreInstance;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::oneshot,
};

use crate::update_peers::snapshot::Snapshot;

const CHAT_PORT: u16 = 47777;
const BIND_TIMEOUT: Duration = Duration::from_secs(5);
const BLOCK_BYTES: usize = 512 * 1024;
const PACKET_BYTES: usize = 64 * 1024;
const MAX_FRAME_BYTES: usize = 128 * 1024;
const BINARY_FLAG: u32 = 1 << 31;

pub(super) async fn serve(
    host: Arc<NativeCoreInstance>,
    snapshot: Arc<Snapshot>,
    delay: Duration,
    ready: oneshot::Sender<Result<(), String>>,
) {
    let mut stream = match accept(&host, delay).await {
        Ok(stream) => stream,
        Err(error) => {
            // The receiver may already have stopped after its preparation deadline.
            let _delivery = ready.send(Err(error));
            return;
        }
    };
    if ready.send(Ok(())).is_err() {
        return;
    }
    let mut queued = Vec::new();
    while let Some(frame) = read_frame(&mut stream).await {
        match frame["type"].as_str() {
            Some("describe") => {
                write_json(
                    &mut stream,
                    json!({
                        "type": "manifest", "size": snapshot.manifest.size,
                        "hashes": snapshot.manifest.hashes, "requestWindow": 8,
                    }),
                )
                .await
            }
            Some("read") => {
                queued.push(frame["index"].as_u64().unwrap() as usize);
                // A stop-and-wait client cannot get any payload from this fixture.
                if queued.len() == 2 {
                    send_early_headers(&mut stream, &snapshot, &queued).await;
                    queued.clear();
                }
            }
            _ => panic!("unexpected pipeline fixture request: {frame}"),
        }
    }
}

async fn accept(
    host: &NativeCoreInstance,
    delay: Duration,
) -> Result<impl AsyncReadExt + AsyncWriteExt + Unpin, String> {
    // The downloader starts first, so the slow fixture still outlasts its 12-second open budget.
    // Only the native tunnel is ready; the application listener does not exist until this delay ends.
    tokio::time::sleep(delay).await;
    let mut listener = host
        .data_plane_tcp_bind(CHAT_PORT, BIND_TIMEOUT)
        .await
        .map_err(|error| format!("pipeline fixture could not bind: {error}"))?;
    listener
        .accept()
        .await
        .map(|(stream, _)| stream)
        .map_err(|error| format!("pipeline fixture could not accept: {error}"))
}

async fn read_frame(stream: &mut (impl AsyncReadExt + Unpin)) -> Option<Value> {
    let length = match stream.read_u32().await {
        Ok(length) => length as usize,
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::UnexpectedEof | std::io::ErrorKind::ConnectionReset
            ) =>
        {
            return None;
        }
        Err(error) => panic!("pipeline fixture could not read a request: {error}"),
    };
    assert!(
        length > 0 && length <= MAX_FRAME_BYTES,
        "invalid text frame length: {length}"
    );
    let mut bytes = vec![0; length];
    stream.read_exact(&mut bytes).await.unwrap();
    Some(serde_json::from_slice(&bytes).unwrap())
}

async fn write_json(stream: &mut (impl AsyncWriteExt + Unpin), frame: Value) {
    let bytes = serde_json::to_vec(&frame).unwrap();
    stream.write_u32(bytes.len() as u32).await.unwrap();
    stream.write_all(&bytes).await.unwrap();
}

async fn send_early_headers(
    stream: &mut (impl AsyncWriteExt + Unpin),
    snapshot: &Arc<Snapshot>,
    indices: &[usize],
) {
    for &index in indices {
        write_json(
            stream,
            json!({"type": "block", "index": index, "length": BLOCK_BYTES}),
        )
        .await;
    }
    for &index in indices {
        for packet in snapshot.block(index).await.unwrap().chunks(PACKET_BYTES) {
            stream
                .write_u32(packet.len() as u32 | BINARY_FLAG)
                .await
                .unwrap();
            stream.write_all(packet).await.unwrap();
        }
    }
}
