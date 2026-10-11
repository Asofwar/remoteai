mod catalog;
mod context;
mod knowledge;
mod prompt;
mod transport;
mod types;

use super::{account_selection, connection::connected, releases, GuiState};
use tauri::{AppHandle, State};
use types::{HelpAnswer, HelpAvailability, HelpError, HelpRequest, HelpStatus, Result};

async fn status(app: AppHandle, state: &GuiState) -> Result<HelpStatus> {
    let installed = tauri::async_runtime::spawn_blocking(move || {
        releases::installed(&app).map(|installed| (app, installed.version.is_some()))
    })
    .await
    .map_err(|_| HelpError::Unavailable)?
    .map_err(|_| HelpError::Unavailable)?;
    if !installed.1 {
        return Ok(HelpStatus::InstallRequired);
    }
    if connected(state).await.is_err() {
        return Ok(HelpStatus::InitializeRequired);
    }
    let selection =
        tauri::async_runtime::spawn_blocking(move || account_selection::read(&installed.0))
            .await
            .map_err(|_| HelpError::Unavailable)?
            .map_err(|_| HelpError::Unavailable)?;
    Ok(
        if selection == account_selection::GuiAccountSelection::None {
            HelpStatus::AccountRequired
        } else {
            HelpStatus::Ready
        },
    )
}

async fn availability(app: AppHandle, state: &GuiState) -> Result<HelpAvailability> {
    let status = status(app.clone(), state).await?;
    let account_revision = if status == HelpStatus::Ready {
        let snapshot =
            tauri::async_runtime::spawn_blocking(move || account_selection::snapshot(&app))
                .await
                .map_err(|_| HelpError::Unavailable)?
                .map_err(|_| HelpError::Unavailable)?;
        Some(snapshot.revision)
    } else {
        None
    };
    Ok(HelpAvailability {
        status,
        account_revision,
    })
}

#[tauri::command]
pub(crate) async fn remote_ai_help_status(
    app: AppHandle,
    state: State<'_, GuiState>,
) -> std::result::Result<HelpAvailability, String> {
    availability(app, &state)
        .await
        .map_err(|error| error.to_string())
}

fn request_context(
    app: AppHandle,
    request: HelpRequest,
) -> Result<(
    context::PreparedContext,
    knowledge::Knowledge,
    serde_json::Value,
)> {
    let context = context::prepare(&app)?;
    if context.revision != request.account_revision {
        return Err(HelpError::AccountChanged);
    }
    let query = request
        .history
        .iter()
        .filter(|message| matches!(message.role, types::MessageRole::User))
        .map(|message| message.text.as_str())
        .chain(std::iter::once(request.question.as_str()))
        .collect::<Vec<_>>()
        .join("\n");
    let knowledge = knowledge::retrieve(&query);
    let body = prompt::request_body(&request, &context, &knowledge);
    Ok((context, knowledge, body))
}

async fn answer(app: AppHandle, state: &GuiState, request: HelpRequest) -> Result<HelpAnswer> {
    request.validate()?;
    let _slot = state.help_request.try_lock().map_err(|_| HelpError::Busy)?;
    match status(app.clone(), state).await? {
        HelpStatus::InstallRequired => return Err(HelpError::InstallRequired),
        HelpStatus::InitializeRequired => return Err(HelpError::InitializeRequired),
        HelpStatus::AccountRequired => return Err(HelpError::AccountRequired),
        HelpStatus::Ready => {}
    }
    let _connection = connected(state)
        .await
        .map_err(|_| HelpError::InitializeRequired)?;
    let context_app = app.clone();
    let (context, knowledge, body) =
        tauri::async_runtime::spawn_blocking(move || request_context(context_app, request))
            .await
            .map_err(|_| HelpError::Unavailable)??;
    let text = transport::answer(&context.base_url, body, context.revision).await?;
    let current = tauri::async_runtime::spawn_blocking(move || account_selection::snapshot(&app))
        .await
        .map_err(|_| HelpError::Unavailable)?
        .map_err(|_| HelpError::Unavailable)?;
    if current.revision != context.revision {
        return Err(HelpError::AccountChanged);
    }
    Ok(HelpAnswer {
        text,
        sources: knowledge.sources,
    })
}

#[tauri::command]
pub(crate) async fn remote_ai_help_ask(
    app: AppHandle,
    state: State<'_, GuiState>,
    request: HelpRequest,
) -> std::result::Result<HelpAnswer, String> {
    answer(app, &state, request)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests;
