use std::{sync::Arc, time::Duration};

use csw_chat_connectivity::Config;
use easytier::instance::factory::NativeCoreInstance;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{oneshot, watch},
    task::JoinHandle,
};

use crate::update_peers::{snapshot::Snapshot, tests::network_fixture};

const CHAT_PORT: u16 = 47777;
const BIND_TIMEOUT: Duration = Duration::from_secs(5);
const PACKET_BYTES: usize = 64 * 1024;
const MAX_FRAME_BYTES: usize = 128 * 1024;
const BINARY_FLAG: u32 = 1 << 31;

pub(super) enum Role {
    Disconnect(watch::Sender<bool>),
    Recover(watch::Receiver<bool>),
}

pub(super) struct Seed {
    pub config: Config,
    pub ready: oneshot::Receiver<()>,
    host: Arc<NativeCoreInstance>,
    worker: JoinHandle<()>,
}

impl Seed {
    pub async fn start(session: &str, snapshot: Arc<Snapshot>, role: Role) -> Self {
        // Discovery has separate integration coverage. This fixture isolates recovery between
        // established encrypted streams instead of racing two independent hole punches.
        let host = network_fixture::host(session).await;
        let mut listener = host
            .data_plane_tcp_bind(CHAT_PORT, BIND_TIMEOUT)
            .await
            .unwrap();
        let config = network_fixture::client(&host, session);
        let (prepared, ready) = oneshot::channel();
        let worker = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            if prepared.send(()).is_err() {
                return;
            }
            serve(&mut stream, &snapshot, role).await;
        });
        Self {
            config,
            ready,
            host,
            worker,
        }
    }

    pub async fn finish(self) {
        self.worker.abort();
        let result = self.worker.await;
        self.host.stop().await;
        if let Err(error) = result {
            assert!(error.is_cancelled(), "recovery seed failed: {error}");
        }
    }
}

async fn serve(
    stream: &mut (impl AsyncReadExt + AsyncWriteExt + Unpin),
    snapshot: &Arc<Snapshot>,
    mut role: Role,
) {
    if let Role::Recover(observer) = &mut role {
        while !*observer.borrow_and_update() {
            if observer.changed().await.is_err() {
                return;
            }
        }
    }
    let mut sent = false;
    while let Some(frame) = read_frame(stream).await {
        match frame["type"].as_str() {
            Some("describe") => {
                write_json(
                    stream,
                    json!({"type": "manifest", "size": snapshot.manifest.size,
                        "hashes": snapshot.manifest.hashes, "requestWindow": 1}),
                )
                .await;
            }
            Some("read") => {
                if disconnect_after_block(&role, sent) {
                    return;
                }
                let index = frame["index"].as_u64().unwrap() as usize;
                send_block(stream, snapshot, index).await;
                sent = true;
            }
            _ => panic!("unexpected recovery fixture request: {frame}"),
        }
    }
}

fn disconnect_after_block(role: &Role, sent: bool) -> bool {
    let Role::Disconnect(requested) = role else {
        return false;
    };
    if !sent {
        return false;
    }
    requested.send_replace(true);
    true
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
        Err(error) => panic!("recovery fixture could not read a request: {error}"),
    };
    assert!(length > 0 && length <= MAX_FRAME_BYTES);
    let mut bytes = vec![0; length];
    stream.read_exact(&mut bytes).await.unwrap();
    Some(serde_json::from_slice(&bytes).unwrap())
}

async fn write_json(stream: &mut (impl AsyncWriteExt + Unpin), frame: Value) {
    let bytes = serde_json::to_vec(&frame).unwrap();
    stream.write_u32(bytes.len() as u32).await.unwrap();
    stream.write_all(&bytes).await.unwrap();
}

async fn send_block(
    stream: &mut (impl AsyncWriteExt + Unpin),
    snapshot: &Arc<Snapshot>,
    index: usize,
) {
    let bytes = snapshot.block(index).await.unwrap();
    write_json(
        stream,
        json!({"type": "block", "index": index, "length": bytes.len()}),
    )
    .await;
    for packet in bytes.chunks(PACKET_BYTES) {
        stream
            .write_u32(packet.len() as u32 | BINARY_FLAG)
            .await
            .unwrap();
        stream.write_all(packet).await.unwrap();
    }
}
