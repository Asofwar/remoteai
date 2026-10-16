//! Recover failed IPC independently of renderer heartbeats and established mobile sessions.
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, Webview};

const STALE_SECONDS: u64 = 60;
#[derive(Default)]
pub(super) struct Health {
    started: std::sync::OnceLock<Instant>,
    active: AtomicBool,
    heartbeat: AtomicU64,
    restart_required: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostHealthStatus {
    restart_required: bool,
}

impl Health {
    fn now(&self) -> u64 {
        self.started.get_or_init(Instant::now).elapsed().as_secs()
    }
    fn stale(&self) -> bool {
        (self.active.load(Ordering::Relaxed) || self.restart_required.load(Ordering::Relaxed))
            && self
                .now()
                .saturating_sub(self.heartbeat.load(Ordering::Relaxed))
                >= STALE_SECONDS
    }

    pub fn transport_failed(&self) {
        self.restart_required.store(true, Ordering::Relaxed);
    }

    pub fn attached(&self) {
        self.restart_required.store(false, Ordering::Relaxed);
    }

    pub fn needs_restart(&self) -> bool {
        self.restart_required.load(Ordering::Relaxed)
    }

    fn heartbeat(&self, active: bool) -> HostHealthStatus {
        self.heartbeat.store(self.now(), Ordering::Relaxed);
        self.active.store(active, Ordering::Relaxed);
        HostHealthStatus {
            restart_required: self.needs_restart(),
        }
    }
}

pub(super) fn start<R: tauri::Runtime>(app: AppHandle<R>) -> Arc<Health> {
    let health = Arc::new(Health::default());
    app.manage(Arc::clone(&health));
    tauri::async_runtime::spawn(watch(app));
    health
}

#[tauri::command]
pub(crate) async fn remote_chat_host_alive(
    app: AppHandle,
    window: Webview,
    active: bool,
) -> Result<HostHealthStatus, String> {
    if window.label() != "main" {
        return Err("请在主窗口连接手机聊天。".into());
    }
    let state = app
        .try_state::<Arc<Health>>()
        .ok_or_else(|| "暂时无法检查连接状态，请稍后重试。".to_string())?;
    Ok(state.heartbeat(active))
}

async fn watch<R: tauri::Runtime>(app: AppHandle<R>) {
    let mut interval = tokio::time::interval(Duration::from_secs(10));
    loop {
        interval.tick().await;
        let state = app.state::<Arc<Health>>();
        if !state.stale() {
            continue;
        }
        state.heartbeat.store(state.now(), Ordering::Relaxed);
        eprintln!("remote chat: recovering an unresponsive host renderer");
        let handle = app.clone();
        if app
            .run_on_main_thread(move || {
                if let Some(window) = handle.get_webview("main") {
                    if window.reload().is_err() {
                        eprintln!("remote chat renderer recovery failed");
                    }
                }
            })
            .is_err()
        {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_recovers_an_active_chat_with_a_stale_host() {
        let health = Health::default();
        health
            .started
            .set(Instant::now() - Duration::from_secs(61))
            .unwrap();
        assert!(!health.stale());
        health.active.store(true, Ordering::Relaxed);
        assert!(health.stale());
        health.heartbeat.store(health.now(), Ordering::Relaxed);
        assert!(!health.stale());
    }

    #[test]
    fn a_responsive_renderer_still_rebuilds_a_stalled_transport_before_pairing() {
        let health = Health::default();
        assert!(!health.heartbeat(false).restart_required);
        health.transport_failed();
        assert!(health.heartbeat(false).restart_required);
        assert!(health.heartbeat(false).restart_required);
        assert!(!health.stale());
        health.attached();
        assert!(!health.heartbeat(false).restart_required);
    }

    #[test]
    fn a_frozen_renderer_is_recoverable_without_an_established_mobile_session() {
        let health = Health::default();
        health
            .started
            .set(Instant::now() - Duration::from_secs(61))
            .unwrap();
        assert!(!health.stale());
        health.transport_failed();
        assert!(health.stale());
        health.heartbeat(false);
        assert!(!health.stale());
    }
}
