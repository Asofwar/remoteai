use std::collections::VecDeque;

use tauri_plugin_notification::NotificationExt;

use super::{Client, GuiEvent};

const RECENT_COMPLETION_LIMIT: usize = 256;

/// Deduplicate terminal events without retaining an unbounded conversation history.
#[derive(Default)]
pub(super) struct CompletionNotifications {
    delivered: VecDeque<(String, String)>,
}

impl CompletionNotifications {
    fn accept(&mut self, event: &GuiEvent) -> bool {
        if event.method != "turn/completed" || event.params["turn"]["status"] != "completed" {
            return false;
        }
        let Some(thread_id) = event.params["threadId"]
            .as_str()
            .filter(|id| !id.is_empty())
        else {
            return false;
        };
        let Some(turn_id) = event.params["turn"]["id"]
            .as_str()
            .filter(|id| !id.is_empty())
        else {
            return false;
        };
        let key = (thread_id.to_owned(), turn_id.to_owned());
        if self.delivered.contains(&key) {
            return false;
        }
        self.delivered.push_back(key);
        if self.delivered.len() > RECENT_COMPLETION_LIMIT {
            self.delivered.pop_front();
        }
        true
    }
}

impl Client {
    pub(super) async fn notify_completion(&self, event: &GuiEvent) {
        if !self.completion_notifications.lock().await.accept(event) {
            return;
        }
        let app = self.app.clone();
        // OS notification delivery may block; it must not delay the event reader or UI.
        tauri::async_runtime::spawn_blocking(move || {
            if app
                .notification()
                .builder()
                .title("Codex GUI · 对话已完成")
                .body("本轮回复已完成，可以查看结果了。")
                .show()
                .is_err()
            {
                eprintln!("Codex GUI could not show a completion notification");
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(thread: &str, turn: &str, status: &str) -> GuiEvent {
        GuiEvent {
            method: "turn/completed".into(),
            id: None,
            params: json!({"threadId": thread, "turn": {"id": turn, "status": status}}),
        }
    }

    #[test]
    fn only_successful_completions_notify_once_per_turn_and_thread() {
        let mut notifications = CompletionNotifications::default();
        for status in ["failed", "interrupted", "inProgress", ""] {
            assert!(!notifications.accept(&event("thread", "turn", status)));
        }
        assert!(notifications.accept(&event("thread", "turn", "completed")));
        assert!(!notifications.accept(&event("thread", "turn", "completed")));
        assert!(notifications.accept(&event("other", "turn", "completed")));
        assert!(notifications.accept(&event("thread", "next", "completed")));
    }

    #[test]
    fn malformed_events_and_non_completion_events_are_ignored() {
        let mut notifications = CompletionNotifications::default();
        assert!(!notifications.accept(&event("", "turn", "completed")));
        assert!(!notifications.accept(&event("thread", "", "completed")));
        let mut started = event("thread", "turn", "completed");
        started.method = "turn/started".into();
        assert!(!notifications.accept(&started));
        started.method = "turn/completed".into();
        started.params = json!({});
        assert!(!notifications.accept(&started));
    }

    #[test]
    fn completion_history_is_bounded() {
        let mut notifications = CompletionNotifications::default();
        for index in 0..=RECENT_COMPLETION_LIMIT {
            assert!(notifications.accept(&event("thread", &index.to_string(), "completed")));
        }
        assert_eq!(notifications.delivered.len(), RECENT_COMPLETION_LIMIT);
    }
}
