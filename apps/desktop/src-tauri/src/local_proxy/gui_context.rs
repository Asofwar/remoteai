//! GUI conversations report their own effective capacity, independently of account-page limits.
use super::*;

pub(super) fn model_catalog(mut payload: UpstreamPayload) -> Result<UpstreamPayload, String> {
    if !(200..300).contains(&payload.status) {
        return Ok(payload);
    }
    let bytes = read_official_model_catalog_body(&mut payload.body)?;
    let mut catalog: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "暂时无法读取 Codex GUI 模型列表，请重试。".to_string())?;
    allow_conversation_capacity(&mut catalog);
    let bytes = serde_json::to_vec(&catalog).map_err(|error| error.to_string())?;
    replace_model_catalog_etags(&mut payload.response_headers, &bytes);
    payload.body = UpstreamBody::Buffered(bytes);
    Ok(payload)
}

fn allow_conversation_capacity(catalog: &mut Value) {
    let Some(models) = catalog.get_mut("models").and_then(Value::as_array_mut) else {
        return;
    };
    for model in models {
        if !model.is_object() {
            continue;
        }
        // Codex clamps model_context_window against this field. A relayed catalog can contain
        // account/Provider limits; they must not cap an explicit per-conversation GUI setting.
        model["max_context_window"] = Value::Null;
    }
}

pub(super) fn mark_session(id: &str) {
    let Ok(mut sessions) = proxy_sessions().lock() else {
        eprintln!("Could not mark Codex GUI proxy session");
        return;
    };
    if let Some(session) = sessions.get_mut(id) {
        session.gui_context.get_or_insert_with(Default::default);
    }
    drop(sessions);
    persist_proxy_session(id, None);
}

/// Record actual CLI usage on a worker; session polling never has to scan GUI conversation files.
pub(crate) async fn record_usage(params: &Value) {
    let Some(id) = params["threadId"].as_str() else {
        return;
    };
    let capacity = params
        .pointer("/tokenUsage/modelContextWindow")
        .and_then(Value::as_u64);
    let used = params
        .pointer("/tokenUsage/last/totalTokens")
        .and_then(Value::as_u64);
    let id = id.to_owned();
    if tauri::async_runtime::spawn_blocking(move || {
        update_usage(&id, capacity, used);
    })
    .await
    .is_err()
    {
        eprintln!("Could not update Codex GUI proxy context usage");
    }
}

fn update_usage(id: &str, capacity: Option<u64>, used: Option<u64>) {
    {
        let Ok(mut sessions) = proxy_sessions().lock() else {
            eprintln!("Could not update Codex GUI proxy session");
            return;
        };
        let Some(session) = sessions.get_mut(id) else {
            return;
        };
        session.gui_context = Some(GuiSessionContext {
            capacity: capacity.filter(|value| *value > 0),
        });
        if used.is_some() {
            session.context_tokens = used;
        }
    }
    persist_proxy_session(id, None);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relayed_limits_do_not_cap_gui_overrides_or_change_default_capacity() {
        let mut catalog = json!({"models": [{"slug": "test-model", "context_window": 272_000,
            "max_context_window": 272_000, "effective_context_window_percent": 95}]});
        allow_conversation_capacity(&mut catalog);
        assert_eq!(catalog["models"][0]["context_window"], 272_000);
        assert_eq!(catalog["models"][0]["max_context_window"], Value::Null);
        assert_eq!(catalog["models"][0]["effective_context_window_percent"], 95);
    }
}
