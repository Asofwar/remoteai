use super::types::{HelpError, Result};
use crate::codex_gui::{
    account_selection::{self, GuiAccountSelection},
    auto_switch_settings, model_settings,
};
use serde_json::{json, Value};
use tauri::AppHandle;

pub(super) struct PreparedContext {
    pub(super) base_url: String,
    pub(super) model: String,
    pub(super) effort: model_settings::Effort,
    pub(super) revision: u64,
    pub(super) configuration: Value,
}

pub(super) fn prepare(app: &AppHandle) -> Result<PreparedContext> {
    let snapshot = account_selection::snapshot(app).map_err(|_| HelpError::Unavailable)?;
    let paths = crate::storage::resolve_paths(app).map_err(|_| HelpError::Unavailable)?;
    let (kind, fallback_model) = match &snapshot.selection {
        GuiAccountSelection::None => return Err(HelpError::AccountRequired),
        GuiAccountSelection::Account(_) => ("account", crate::providers::official_model()),
        GuiAccountSelection::Provider(id) => (
            "provider",
            crate::providers::read_provider(&paths, id)
                .map_err(|_| HelpError::AccountRequired)?
                .model,
        ),
    };
    let selection = model_settings::read_draft(app).map_err(|_| HelpError::Unavailable)?;
    let (model, effort) = selection
        .map(|selection| (selection.model, selection.effort))
        .unwrap_or((fallback_model, model_settings::Effort::Low));
    model_settings::validate_model(&model).map_err(|_| HelpError::Unavailable)?;
    let state = crate::storage::try_read_state(&paths).map_err(|_| HelpError::Unavailable)?;
    let configuration = json!({
        "applicationVersion": app.package_info().version.to_string(), "platform": std::env::consts::OS,
        "gui": {"selectedAccountKind": kind, "model": model, "reasoningEffort": effort,
            "autoSwitch": gui_switch_summary(app)?},
        "accountManager": manager_summary(&state),
        "scope": "Only these saved settings were read, not live connectivity, logs, files or other conversations."
    });
    Ok(PreparedContext {
        base_url: crate::local_proxy::gui_runtime::ensure_started(app)
            .map_err(|_| HelpError::Unavailable)?,
        model,
        effort,
        revision: snapshot.revision,
        configuration,
    })
}

fn gui_switch_summary(app: &AppHandle) -> Result<Value> {
    let settings = auto_switch_settings::read(app).map_err(|_| HelpError::Unavailable)?;
    Ok(json!({"enabled": settings.enabled, "mode": settings.mode,
        "switchOnQuotaExhaustion": settings.switch_on_quota_exhaustion,
        "minimumRemainingPercent": settings.minimum_remaining_percent,
        "fallbackProviderConfigured": settings.fallback_provider_id.is_some()}))
}

pub(super) fn manager_summary(state: &crate::models::ManagerStateFile) -> Value {
    json!({
        "proxyEnabled": state.local_proxy_enabled,
        "lanAccessEnabled": state.local_proxy_listen_on_all_interfaces,
        "autoSwitchOnQuotaExhaustion": state.auto_switch_on_quota_exhaustion,
        "concurrentRoutingEnabled": state.concurrent_account_routing_enabled,
        "promptFilterEnabled": state.system_prompt_filter_enabled,
        "promptInjectionEnabled": state.system_prompt_injection_enabled,
        "imageInputConfigured": state.image_input_target.is_some(),
        "imageOutputConfigured": state.image_output_target.is_some()
    })
}
