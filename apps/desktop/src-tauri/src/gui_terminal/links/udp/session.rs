use super::*;
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Instant,
};
use tokio::{
    sync::{mpsc, watch},
    task::JoinHandle,
    time::timeout,
};

pub(super) struct Activity {
    start: Instant,
    last: AtomicU64,
}
impl Activity {
    pub fn new() -> Self {
        Self {
            start: Instant::now(),
            last: AtomicU64::new(0),
        }
    }
    pub fn touch(&self) {
        self.last
            .store(self.start.elapsed().as_secs(), Ordering::Relaxed);
    }
    pub fn expired(&self) -> bool {
        self.expired_after(SESSION_IDLE)
    }
    pub fn expired_after(&self, duration: Duration) -> bool {
        self.start
            .elapsed()
            .as_secs()
            .saturating_sub(self.last.load(Ordering::Relaxed))
            >= duration.as_secs()
    }
}

pub(super) struct Worker {
    pub commands: mpsc::Receiver<Vec<Datagram>>,
    pub packets: mpsc::Sender<Datagram>,
    pub cancel: watch::Receiver<bool>,
    pub activity: Arc<Activity>,
}

pub(super) struct Session {
    pub scope: String,
    commands: mpsc::Sender<Vec<Datagram>>,
    packets: Mutex<mpsc::Receiver<Datagram>>,
    cancel: watch::Sender<bool>,
    task: Mutex<Option<JoinHandle<Result<()>>>>,
    activity: Arc<Activity>,
}

impl Session {
    pub fn local(scope: String, socket: UdpSocket) -> Self {
        Self::spawn(scope, |worker| local::run(socket, worker))
    }
    pub fn remote(scope: String, target: SocketAddr) -> Self {
        Self::spawn(scope, |worker| remote::run(target, worker))
    }

    fn spawn<F, Fut>(scope: String, run: F) -> Self
    where
        F: FnOnce(Worker) -> Fut,
        Fut: std::future::Future<Output = Result<()>> + Send + 'static,
    {
        let (commands, receiver) = mpsc::channel(QUEUE_SIZE);
        let (sender, packets) = mpsc::channel(QUEUE_SIZE);
        let (cancel, cancellation) = watch::channel(false);
        let activity = Arc::new(Activity::new());
        let future = run(Worker {
            commands: receiver,
            packets: sender,
            cancel: cancellation,
            activity: activity.clone(),
        });
        let finished = cancel.clone();
        let task = tokio::spawn(async move {
            let result = future.await;
            finished.send_replace(true);
            result
        });
        Self {
            scope,
            commands,
            packets: Mutex::new(packets),
            cancel,
            task: Mutex::new(Some(task)),
            activity,
        }
    }

    pub fn closed(&self) -> bool {
        *self.cancel.borrow()
    }

    pub async fn close(&self) {
        self.cancel.send_replace(true);
        if let Some(task) = self.task.lock().await.take() {
            // I/O failure is already reported to readers; closing must still release the listener.
            if !matches!(task.await, Ok(Ok(()))) {
                eprintln!("UDP mapping worker stopped after an I/O failure");
            }
        }
    }

    pub async fn read(&self) -> Result<LinkReply> {
        self.activity.touch();
        let mut receiver = self.packets.try_lock().map_err(|_| LinkError::Limit)?;
        let mut cancel = self.cancel.subscribe();
        if *cancel.borrow() {
            return Err(LinkError::Closed);
        }
        let first = tokio::select! {
            _ = cancel.changed() => return Err(LinkError::Closed),
            result = timeout(READ_WAIT, receiver.recv()) => match result {
                Ok(Some(packet)) => Some(packet),
                Ok(None) => return Err(LinkError::Closed),
                Err(_) => None,
            }
        };
        let mut packets: Vec<_> = first.into_iter().collect();
        while packets.len() < MAX_BATCH {
            let Ok(packet) = receiver.try_recv() else {
                break;
            };
            packets.push(packet);
        }
        Ok(LinkReply::Datagrams {
            packets: packets
                .into_iter()
                .map(|packet| Packet {
                    peer: packet.peer,
                    data: STANDARD.encode(packet.data),
                })
                .collect(),
        })
    }

    pub async fn write(&self, packets: Vec<Datagram>) -> Result<()> {
        self.activity.touch();
        if self.closed() {
            return Err(LinkError::Closed);
        }
        // UDP drops at bounded queue limits instead of blocking chat or growing unbounded memory.
        match self.commands.try_send(packets) {
            Ok(()) | Err(mpsc::error::TrySendError::Full(_)) => Ok(()),
            Err(mpsc::error::TrySendError::Closed(_)) => Err(LinkError::Closed),
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.cancel.send_replace(true);
    }
}

pub(super) fn enqueue(sender: &mpsc::Sender<Datagram>, packet: Datagram) {
    // Dropping datagrams under overload is intentional; never stall the socket receive loop.
    match sender.try_send(packet) {
        Ok(()) | Err(mpsc::error::TrySendError::Full(_) | mpsc::error::TrySendError::Closed(_)) => {
        }
    }
}
