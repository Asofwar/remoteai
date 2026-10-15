use super::{Error, Result};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{watch, Mutex};

const MIN_UPLOAD_KIB_PER_SECOND: u32 = 64;
const MAX_UPLOAD_KIB_PER_SECOND: u32 = 8192;
const NETWORK_CHECK_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum SharingScope {
    Off,
    Own,
    #[default]
    Everyone,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Preferences {
    pub scope: SharingScope,
    /// Zero disables throttling; nonzero limits apply across all uploads.
    pub upload_kib_per_second: u32,
    pub unmetered_only: bool,
    pub prepare_android: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            scope: SharingScope::Everyone,
            upload_kib_per_second: 0,
            unmetered_only: false,
            prepare_android: true,
        }
    }
}

impl Preferences {
    fn validate(&self) -> Result<()> {
        if self.upload_kib_per_second != 0
            && !(MIN_UPLOAD_KIB_PER_SECOND..=MAX_UPLOAD_KIB_PER_SECOND)
                .contains(&self.upload_kib_per_second)
        {
            return Err(Error::Invalid);
        }
        Ok(())
    }
}

#[derive(Default)]
pub(super) struct Metrics {
    pub peer_bytes: AtomicU64,
    pub origin_bytes: AtomicU64,
    pub uploaded_bytes: AtomicU64,
    pub retries: AtomicU64,
    pub failures: AtomicU64,
}

pub(super) struct Policy {
    settings: watch::Sender<Preferences>,
    unmetered: AtomicBool,
    next_upload: Mutex<tokio::time::Instant>,
    pub metrics: Metrics,
}

impl Policy {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            settings: watch::channel(Preferences::default()).0,
            unmetered: AtomicBool::new(false),
            next_upload: Mutex::new(tokio::time::Instant::now()),
            metrics: Metrics::default(),
        })
    }

    pub fn preferences(&self) -> Preferences {
        self.settings.borrow().clone()
    }

    pub fn allows_network(&self) -> bool {
        !self.preferences().unmetered_only || self.unmetered.load(Ordering::Relaxed)
    }

    pub fn allows_upload(&self) -> bool {
        self.allows_download() && self.allows_network()
    }

    pub fn allows_download(&self) -> bool {
        self.preferences().scope != SharingScope::Off
    }

    /// Transfers observe scope changes independently of the signaling connection.
    pub async fn scope_changed(&self, initial: SharingScope) {
        let mut settings = self.settings.subscribe();
        while settings.borrow_and_update().scope == initial {
            if settings.changed().await.is_err() {
                return;
            }
        }
    }

    pub async fn throttle(&self, bytes: usize) -> Result<()> {
        let mut settings = self.settings.subscribe();
        loop {
            let preferences = settings.borrow_and_update().clone();
            if !self.allows_upload() {
                return Err(Error::Unavailable);
            }
            if preferences.upload_kib_per_second == 0 {
                break;
            }
            let limit = f64::from(preferences.upload_kib_per_second) * 1024.0;
            let until = {
                let mut next = self.next_upload.lock().await;
                *next = (*next).max(tokio::time::Instant::now())
                    + Duration::from_secs_f64(bytes as f64 / limit);
                *next
            };
            tokio::select! {
                _ = tokio::time::sleep_until(until) => break,
                changed = settings.changed() => changed.map_err(|_| Error::Unavailable)?,
            }
        }
        if !self.allows_upload() {
            return Err(Error::Unavailable);
        }
        self.metrics
            .uploaded_bytes
            .fetch_add(bytes as u64, Ordering::Relaxed);
        Ok(())
    }

    pub async fn run(self: Arc<Self>) {
        loop {
            let allowed = tokio::task::spawn_blocking(super::network_cost::unmetered)
                .await
                .unwrap_or(false);
            self.unmetered.store(allowed, Ordering::Relaxed);
            tokio::time::sleep(NETWORK_CHECK_INTERVAL).await;
        }
    }

    /// Only the configured administration server can replace the running policy.
    pub async fn apply(&self, settings: Preferences) -> Result<()> {
        settings.validate()?;
        let mut next = self.next_upload.lock().await;
        self.settings.send_if_modified(|current| {
            if *current == settings {
                return false;
            }
            *current = settings;
            *next = tokio::time::Instant::now();
            true
        });
        Ok(())
    }

    #[cfg(test)]
    pub fn testing() -> Arc<Self> {
        let policy = Self::new();
        policy.unmetered.store(true, Ordering::Relaxed);
        policy
    }
}

#[cfg(test)]
#[path = "policy_tests.rs"]
mod tests;
