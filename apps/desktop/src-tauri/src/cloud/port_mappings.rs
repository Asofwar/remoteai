use super::*;

const SYNC_ERROR: &str = "配置暂未同步，联网后会自动重试。";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PortMapping {
    id: String,
    remote_host: String,
    remote_port: u16,
    local_port: u16,
    updated_at: Option<u64>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MappingDocument {
    revision: u64,
    mappings: Vec<PortMapping>,
    #[serde(default)]
    accepted: bool,
}

fn valid_document(document: &MappingDocument) -> bool {
    document.mappings.len() <= 8
        && document.mappings.iter().all(|entry| {
            valid_id(&entry.id)
                && entry.remote_port > 0
                && entry.local_port > 0
                && entry
                    .remote_host
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| !ip.is_unspecified())
        })
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn exchange<R: Runtime>(
    app: &tauri::AppHandle<R>,
    identity: GuiCloudIdentity,
    device_id: String,
    document: Option<MappingDocument>,
) -> Result<MappingDocument, String> {
    if !valid_id(&device_id)
        || document
            .as_ref()
            .is_some_and(|value| !valid_document(value))
    {
        return Err(SYNC_ERROR.into());
    }
    let _guard = lock_cloud_credentials()?;
    let mut settings = read_app_settings(app)?;
    if base_url(&settings)? != identity.base_url
        || settings.cloud_user_id.as_deref() != Some(&identity.user_id)
    {
        return Err(SYNC_ERROR.into());
    }
    let mut credentials = read_cloud_credentials(app);
    let client = api_client()?;
    let method = if document.is_some() {
        Method::PUT
    } else {
        Method::GET
    };
    let body = document
        .map(serde_json::to_value)
        .transpose()
        .map_err(|_| SYNC_ERROR.to_string())?;
    let response = cloud_request(
        app,
        &client,
        &mut settings,
        &mut credentials,
        method,
        &format!("/devices/{device_id}/port-mappings"),
        body,
    )?;
    let result: MappingDocument = response
        .error_for_status()
        .map_err(|_| SYNC_ERROR.to_string())?
        .json()
        .map_err(|_| SYNC_ERROR.to_string())?;
    if !valid_document(&result) {
        return Err(SYNC_ERROR.into());
    }
    Ok(result)
}

/// Credentials and blocking cloud I/O remain in the native worker.
#[tauri::command]
pub(crate) async fn sync_port_mappings(
    app: tauri::AppHandle,
    identity: GuiCloudIdentity,
    device_id: String,
    document: Option<MappingDocument>,
) -> Result<MappingDocument, String> {
    tauri::async_runtime::spawn_blocking(move || exchange(&app, identity, device_id, document))
        .await
        .map_err(|_| SYNC_ERROR.to_string())?
        .map_err(|_| SYNC_ERROR.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_paths_and_invalid_targets() {
        for id in ["", "../other", "a/b", "a?b", "a%2fb"] {
            assert!(!valid_id(id));
        }
        assert!(valid_id("device-123"));
        let mut doc = MappingDocument {
            revision: 0,
            accepted: false,
            mappings: vec![PortMapping {
                id: "mapping-1".into(),
                remote_host: "::1".into(),
                remote_port: 3000,
                local_port: 13000,
                updated_at: None,
            }],
        };
        assert!(valid_document(&doc));
        doc.mappings[0].remote_host = "0.0.0.0".into();
        assert!(!valid_document(&doc));
    }
}
