use super::*;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

type RecordQueue = Arc<Mutex<mpsc::Receiver<Vec<u8>>>>;

fn records() -> (mpsc::Sender<Vec<u8>>, RecordQueue) {
    let (send, receive) = mpsc::channel(32);
    (send, Arc::new(Mutex::new(receive)))
}

#[tokio::test]
async fn native_download_batches_preserve_bytes_and_leave_excess_records_for_the_next_pull() {
    let (send, receive) = records();
    for index in 0..20 {
        send.send(vec![index; MAX_RECORD_BYTES]).await.unwrap();
    }
    let batch = receive_batch(|| async { receive.lock().await.recv().await })
        .await
        .unwrap();
    assert_eq!(&batch[..5], b"RAN1\x10");
    assert_eq!(
        batch.len(),
        BATCH_HEADER_BYTES + 16 * (4 + MAX_RECORD_BYTES)
    );
    let (frames, remainder) = batch[BATCH_HEADER_BYTES..].as_chunks::<{ 4 + MAX_RECORD_BYTES }>();
    assert!(remainder.is_empty());
    for (index, frame) in frames.iter().enumerate() {
        assert_eq!(&frame[..4], &(MAX_RECORD_BYTES as u32).to_be_bytes());
        assert_eq!(&frame[4..], vec![index as u8; MAX_RECORD_BYTES]);
    }
    let batch = receive_batch(|| async { receive.lock().await.recv().await })
        .await
        .unwrap();
    assert_eq!(&batch[..5], b"RAN1\x04");
    assert_eq!(batch.len(), BATCH_HEADER_BYTES + 4 * (4 + MAX_RECORD_BYTES));
}

#[tokio::test]
async fn idle_pulls_time_out_without_losing_later_records_and_close_unblocks_the_reader() {
    let (send, receive) = records();
    assert!(
        receive_batch(|| async { receive.lock().await.recv().await })
            .await
            .unwrap()
            .is_empty()
    );
    send.send(vec![7; MAX_RECORD_BYTES]).await.unwrap();
    let batch = receive_batch(|| async { receive.lock().await.recv().await })
        .await
        .unwrap();
    assert_eq!(&batch[..5], b"RAN1\x01");
    assert_eq!(&batch[9..], vec![7; MAX_RECORD_BYTES]);
    drop(send);
    assert!(matches!(
        receive_batch(|| async { receive.lock().await.recv().await }).await,
        Err(ChatError::Transport)
    ));
}

#[tokio::test]
async fn native_download_waits_do_not_block_control_work_or_allow_oversized_batches() {
    let (send, receive) = records();
    let read =
        tokio::spawn(
            async move { receive_batch(|| async { receive.lock().await.recv().await }).await },
        );
    tokio::task::yield_now().await;
    assert!(!read.is_finished());
    send.send(vec![1; MAX_RECORD_BYTES + 1]).await.unwrap();
    assert!(matches!(read.await.unwrap(), Err(ChatError::InvalidFrame)));
}

#[tokio::test]
async fn native_mapping_records_are_consumed_without_entering_file_ipc_batches() {
    let (send, receive) = records();
    for _ in 0..20 {
        send.send(vec![1; 128]).await.unwrap();
    }
    send.send(vec![2; 128]).await.unwrap();
    let routed = std::sync::atomic::AtomicUsize::new(0);
    let batch = receive_routed_batch(
        || async { receive.lock().await.recv().await },
        |record| {
            if record[0] != 1 {
                return false;
            }
            routed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            true
        },
    )
    .await
    .unwrap();
    assert_eq!(routed.load(std::sync::atomic::Ordering::Relaxed), 20);
    assert_eq!(&batch[..5], b"RAN1\x01");
    assert_eq!(&batch[9..], vec![2; 128]);
    send.send(vec![1; 128]).await.unwrap();
    assert!(
        receive_routed_batch(|| async { receive.lock().await.recv().await }, |_| true)
            .await
            .unwrap()
            .is_empty()
    );
}
