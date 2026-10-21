//! Resolve the required Messages output length from the authenticated upstream model metadata.
use std::{
    collections::VecDeque,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use reqwest::{blocking::RequestBuilder, Url};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::models::ProviderProfile;

const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const CACHE_ENTRIES: usize = 128;

#[derive(Debug, thiserror::Error)]
pub(super) enum OutputLimitError {
    #[error("输出长度必须为正整数，请检查请求或 Provider 中的 max_tokens 设置。")]
    Invalid,
    #[error(
        "无法获取此模型的最大输出长度。请在 Provider 的自定义请求参数中设置 max_tokens 后重试。"
    )]
    Unavailable,
}

struct Entry {
    key: [u8; 32],
    maximum: u64,
    expires: Instant,
}

fn cache() -> &'static Mutex<VecDeque<Entry>> {
    static CACHE: OnceLock<Mutex<VecDeque<Entry>>> = OnceLock::new();
    CACHE.get_or_init(Mutex::default)
}

pub(super) fn ensure(
    body: &mut Value,
    headers: &[(String, String)],
    provider: &ProviderProfile,
) -> Result<(), OutputLimitError> {
    if let Some(explicit) = body.get("max_tokens") {
        return positive_limit(explicit)
            .map(|_| ())
            .ok_or(OutputLimitError::Invalid);
    }
    let model = body["model"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or(OutputLimitError::Unavailable)?;
    body["max_tokens"] = json!(discover(model, headers, provider)?);
    Ok(())
}

fn discover(
    model: &str,
    headers: &[(String, String)],
    provider: &ProviderProfile,
) -> Result<u64, OutputLimitError> {
    let _deadline = super::super::model_catalog_deadline::Scope::enter();
    let client = super::super::http_client().map_err(|_| OutputLimitError::Unavailable)?;
    let metadata_headers = headers
        .iter()
        .filter(|(name, _)| {
            !matches!(
                name.to_ascii_lowercase().as_str(),
                "content-type" | "content-encoding" | "accept"
            )
        })
        .cloned()
        .collect::<Vec<_>>();
    let request = super::authenticated_request(
        client
            .get(model_url(provider, model)?)
            .header("accept", "application/json"),
        &metadata_headers,
        provider,
    );
    let key = cache_key(&request, provider)?;
    if let Some(maximum) = cached(&key) {
        return Ok(maximum);
    }
    let request = super::super::upstream_transport::Request::prepare(request)
        .map_err(|_| OutputLimitError::Unavailable)?;
    let response = request.send().map_err(|_| OutputLimitError::Unavailable)?;
    if !response.status().is_success() {
        return Err(OutputLimitError::Unavailable);
    }
    let value: Value =
        serde_json::from_reader(response).map_err(|_| OutputLimitError::Unavailable)?;
    let maximum = positive_limit(&value["max_tokens"]).ok_or(OutputLimitError::Unavailable)?;
    remember(key, maximum);
    Ok(maximum)
}

fn positive_limit(value: &Value) -> Option<u64> {
    value.as_u64().filter(|value| *value > 0)
}

fn model_url(provider: &ProviderProfile, model: &str) -> Result<Url, OutputLimitError> {
    let messages = super::super::provider_request_options::url(provider, "/messages");
    let mut url = Url::parse(&messages).map_err(|_| OutputLimitError::Unavailable)?;
    // A custom invocation path has no unambiguous sibling model API.
    if !matches!(url.scheme(), "http" | "https")
        || !url.path().trim_end_matches('/').ends_with("/messages")
    {
        return Err(OutputLimitError::Unavailable);
    }
    url.path_segments_mut()
        .map_err(|_| OutputLimitError::Unavailable)?
        .pop_if_empty()
        .pop()
        .push("models")
        .push(model);
    url.set_fragment(None);
    Ok(url)
}

fn cache_key(
    request: &RequestBuilder,
    provider: &ProviderProfile,
) -> Result<[u8; 32], OutputLimitError> {
    let request = request
        .try_clone()
        .ok_or(OutputLimitError::Unavailable)?
        .build()
        .map_err(|_| OutputLimitError::Unavailable)?;
    let mut hash = Sha256::new();
    for bytes in [provider.id.as_bytes(), request.url().as_str().as_bytes()] {
        hash.update(bytes.len().to_le_bytes());
        hash.update(bytes);
    }
    for (name, value) in request.headers() {
        hash.update(name.as_str().len().to_le_bytes());
        hash.update(name.as_str());
        hash.update(value.as_bytes().len().to_le_bytes());
        hash.update(value.as_bytes());
    }
    Ok(hash.finalize().into())
}

fn cached(key: &[u8; 32]) -> Option<u64> {
    // Cache failure must not prevent discovery; never hold this guard during network I/O.
    let mut cache = cache().lock().ok()?;
    cache.retain(|entry| entry.expires > Instant::now());
    cache
        .iter()
        .find(|entry| &entry.key == key)
        .map(|entry| entry.maximum)
}

fn remember(key: [u8; 32], maximum: u64) {
    // This cache is optional; a poisoned lock only skips caching.
    let Ok(mut cache) = cache().lock() else {
        return;
    };
    cache.retain(|entry| entry.key != key && entry.expires > Instant::now());
    while cache.len() >= CACHE_ENTRIES {
        cache.pop_front();
    }
    cache.push_back(Entry {
        key,
        maximum,
        expires: Instant::now() + CACHE_TTL,
    });
}

#[cfg(test)]
mod tests;
