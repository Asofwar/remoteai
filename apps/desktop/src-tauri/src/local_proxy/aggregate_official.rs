/// Account overrides isolate aggregate routing from shared account and concurrent routing state.
fn forward_aggregate_official<R: Runtime>(
    app: &tauri::AppHandle<R>,
    request: &AggregateForwardRequest<'_>,
    account_id: &str,
    model: &str,
) -> Result<UpstreamPayload, String> {
    if is_anthropic_messages_endpoint(request_path(request.url)) {
        return forward_anthropic_official(
            app,
            request.headers,
            request.body.clone(),
            AnthropicOfficialContext {
                session_id: request.session_id,
                account_id_override: Some(account_id),
                model_override: Some(model),
            },
        );
    }
    forward_official(OfficialForwardRequest {
        app,
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: aggregate_official_body(request, model)?,
        model,
        session_id: request.session_id,
        account_id_override: Some(account_id),
    })
}

fn aggregate_official_body(
    request: &AggregateForwardRequest<'_>,
    model: &str,
) -> Result<Vec<u8>, String> {
    if *request.method != Method::Post || !is_responses_endpoint(request_path(request.url)) {
        return Ok(request.body.clone());
    }
    let mut body: Value = serde_json::from_slice(&request.body)
        .map_err(|_| "The request body is not valid JSON".to_string())?;
    let object = body
        .as_object_mut()
        .ok_or("The request body must be an object")?;
    object.insert("model".into(), Value::String(model.into()));
    serde_json::to_vec(&body).map_err(|_| "Unable to prepare the request".to_string())
}
