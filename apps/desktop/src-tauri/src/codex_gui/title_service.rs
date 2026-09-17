use super::Client;
use crate::codex_gui::{
    error::{GuiError, Result},
    protocol::GuiResponse,
    title_generation::{explicit_title, TitleRequest},
    title_worker,
};
use serde_json::json;

impl Client {
    pub(crate) async fn generate_title(&self, request: TitleRequest) -> Result<GuiResponse> {
        request.validate()?;
        let skipped = || GuiResponse {
            data: json!({"title": null}),
        };
        let Ok(_slot) = self.title_slots.try_acquire() else {
            return Ok(skipped());
        };
        if !self
            .title_jobs
            .lock()
            .await
            .insert(request.thread_id.clone())
        {
            return Ok(skipped());
        }
        let existing = self
            .request_raw("thread/read", json!({"threadId": request.thread_id}))
            .await?;
        if explicit_title(&existing["thread"]).is_some() {
            return Ok(skipped());
        }
        let title = self.title_candidate(&request).await?;
        self.save_generated_title(&request.thread_id, title).await
    }

    async fn title_candidate(&self, request: &TitleRequest) -> Result<String> {
        let app = self.app.clone();
        let home = self.home.clone();
        let (binary, home) = tauri::async_runtime::spawn_blocking(move || {
            Ok((
                crate::codex_gui::releases::executable(&app)?,
                crate::codex_gui::home::prepare_title_home(&home)?,
            ))
        })
        .await
        .map_err(|_| GuiError::Startup)??;
        title_worker::generate(binary, home, request).await
    }

    async fn save_generated_title(&self, thread_id: &str, title: String) -> Result<GuiResponse> {
        // Serialize the final comparison and write with manual renames, never with the model request.
        let _guard = self.title_writes.lock().await;
        let latest = self
            .request_raw("thread/read", json!({"threadId": thread_id}))
            .await?;
        if explicit_title(&latest["thread"]).is_some() {
            return Ok(GuiResponse {
                data: json!({"title": null}),
            });
        }
        self.request_raw(
            "thread/name/set",
            json!({"threadId": thread_id, "name": title}),
        )
        .await?;
        Ok(GuiResponse {
            data: json!({"title": title}),
        })
    }
}
