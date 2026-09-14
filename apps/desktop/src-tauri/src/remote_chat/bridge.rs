use std::collections::VecDeque;

use serde::Serialize;

use super::protocol::{Envelope, Event};

const MAX_QUEUED_EVENTS: usize = 256;
const MAX_QUEUED_BYTES: usize = 4 * 1024 * 1024;
const BATCH_SIZE: usize = 32;

#[derive(Serialize)]
pub(crate) struct Batch {
    pub(super) sequence: u64,
    pub(super) events: Vec<Envelope>,
}

/// At most one batch is in IPC. A paused WebView cannot accumulate unbounded callbacks.
pub(super) struct Bridge {
    pub client_id: String,
    deliver: Box<dyn Fn(Batch) -> bool + Send>,
    queue: VecDeque<Envelope>,
    bytes: usize,
    sequence: u64,
    pending: bool,
}

impl Bridge {
    pub fn new(client_id: String, deliver: Box<dyn Fn(Batch) -> bool + Send>) -> Self {
        Self {
            client_id,
            deliver,
            queue: VecDeque::new(),
            bytes: 0,
            sequence: 0,
            pending: false,
        }
    }

    pub fn enqueue(&mut self, envelope: Envelope) -> bool {
        let bytes = event_bytes(&envelope);
        if self.queue.len() >= MAX_QUEUED_EVENTS || self.bytes + bytes > MAX_QUEUED_BYTES {
            return false;
        }
        self.bytes += bytes;
        self.queue.push_back(envelope);
        true
    }

    pub fn reset(&mut self, generation: u64) {
        self.queue.clear();
        self.bytes = 0;
        // An already delivered batch is acknowledged first; its generation is no longer writable.
        self.queue.push_back(Envelope {
            generation,
            event: Event::Reset,
        });
    }

    pub fn acknowledge(&mut self, sequence: u64) {
        if sequence == self.sequence {
            self.pending = false;
        }
    }

    pub fn flush(&mut self) -> bool {
        if self.pending || self.queue.is_empty() {
            return true;
        }
        let events: Vec<_> = self
            .queue
            .drain(..self.queue.len().min(BATCH_SIZE))
            .collect();
        self.bytes = self
            .bytes
            .saturating_sub(events.iter().map(event_bytes).sum());
        self.sequence += 1;
        self.pending = true;
        (self.deliver)(Batch {
            sequence: self.sequence,
            events,
        })
    }
}

fn event_bytes(envelope: &Envelope) -> usize {
    match &envelope.event {
        Event::Message { data } => data.len(),
        _ => 0,
    }
}
