use super::*;
use crate::update_peers::{signaling::Lease, tests::network_fixture, transfer::Frame};
use base64::{engine::general_purpose::STANDARD, Engine};
use easytier::instance::factory::NativeCoreInstance;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const SOURCE_COUNT: usize = 3;
const CHAT_PORT: u16 = 47777;
const CHUNK_BYTES: usize = 64 * 1024;
const FIXTURE_TIMEOUT: Duration = Duration::from_secs(5);

struct ReadySeed {
    config: csw_chat_connectivity::Config,
    host: Arc<NativeCoreInstance>,
    worker: tokio::task::JoinHandle<()>,
}

#[tokio::test(flavor = "multi_thread", worker_threads = 6)]
async fn three_native_seeders_deliver_disjoint_ranges_without_origin_download() {
    let bytes: Vec<u8> = (0..300_127).map(|index| (index % 251) as u8).collect();
    let origin = Origin::with_bytes(bytes.clone());
    let update = origin.update().await;
    let directory = tempfile::tempdir().unwrap();
    let receiving = service(directory.path(), &origin.key);
    let artifact = Artifact::from_update(&update);
    let mut seeds = Vec::new();
    for index in 0..SOURCE_COUNT {
        seeds.push(ready_seed(index, &artifact.id, Arc::new(bytes.clone())).await);
    }
    let configs: Vec<_> = seeds.iter().map(|seed| seed.config.clone()).collect();
    let (sender, mut broker) = mpsc::channel(16);
    receiving.broker.send_replace(Some(sender.clone()));
    let signaling = tokio::spawn(async move {
        let Some(Request::Find { reply, .. }) = broker.recv().await else {
            panic!("expected peer lookup")
        };
        let leases = configs
            .into_iter()
            .map(|config| Lease::new(config, sender.clone()).unwrap())
            .collect();
        assert!(reply.send(Ok(leases)).is_ok());
        while broker.recv().await.is_some() {}
    });
    let result = tokio::time::timeout(
        Duration::from_secs(45),
        resolve(&receiving, &update, &mut progress()),
    )
    .await;
    finish_seeds(seeds).await;
    signaling.abort();
    assert_eq!(result.unwrap().unwrap().bytes.as_slice(), bytes);
    assert_eq!(
        origin.downloads.load(Ordering::Relaxed),
        0,
        "multi-source unexpectedly used GitHub"
    );
}

async fn ready_seed(index: usize, artifact: &str, bytes: Arc<Vec<u8>>) -> ReadySeed {
    // Discovery and the production uploader have separate integration coverage. This test checks
    // disjoint downloads from ready native sources, without racing three coordinator hole punches.
    let session = format!("multi-source-{index}");
    let host = network_fixture::host(&session).await;
    let mut listener = host
        .data_plane_tcp_bind(CHAT_PORT, FIXTURE_TIMEOUT)
        .await
        .unwrap();
    let config = network_fixture::client(&host, &session);
    let artifact = artifact.to_owned();
    let worker = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let Frame::Get {
            artifact: requested,
            part: Some(part),
        } = read_frame(&mut stream).await
        else {
            panic!("expected a partitioned package request")
        };
        assert_eq!(requested, artifact);
        assert_eq!((part.index, part.count), (index, SOURCE_COUNT));
        serve_range(&mut stream, &bytes, part.range(bytes.len()).unwrap()).await;
        assert!(matches!(read_frame(&mut stream).await, Frame::Received));
    });
    ReadySeed {
        config,
        host,
        worker,
    }
}

async fn serve_range(
    stream: &mut (impl AsyncWriteExt + Unpin),
    bytes: &[u8],
    range: std::ops::Range<usize>,
) {
    write_frame(
        stream,
        &Frame::Header {
            size: bytes.len(),
            offset: range.start,
            length: Some(range.len()),
        },
    )
    .await;
    let mut offset = range.start;
    for chunk in bytes[range].chunks(CHUNK_BYTES) {
        write_frame(
            stream,
            &Frame::Chunk {
                offset,
                data: STANDARD.encode(chunk),
            },
        )
        .await;
        offset += chunk.len();
    }
    write_frame(stream, &Frame::Complete).await;
}

async fn read_frame(stream: &mut (impl AsyncReadExt + Unpin)) -> Frame {
    let length = stream.read_u32().await.unwrap() as usize;
    assert!(length <= CHUNK_BYTES * 2, "oversized fixture frame");
    let mut bytes = vec![0; length];
    stream.read_exact(&mut bytes).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

async fn write_frame(stream: &mut (impl AsyncWriteExt + Unpin), frame: &Frame) {
    let bytes = serde_json::to_vec(frame).unwrap();
    stream.write_u32(bytes.len() as u32).await.unwrap();
    stream.write_all(&bytes).await.unwrap();
}

async fn finish_seeds(seeds: Vec<ReadySeed>) {
    let mut results = Vec::new();
    for mut seed in seeds {
        results.push(tokio::time::timeout(FIXTURE_TIMEOUT, &mut seed.worker).await);
        seed.worker.abort();
        seed.host.stop().await;
    }
    for (index, result) in results.into_iter().enumerate() {
        assert!(matches!(result, Ok(Ok(()))), "source {index}: {result:?}");
    }
}
