use super::types::{HelpError, Result, MAX_ANSWER_CHARS};
use crate::codex_config::{
    HELP_ACCOUNT_REVISION_HEADER, HELP_REQUEST_PURPOSE, LOCAL_PROXY_ACTOR_AUTHORIZATION_HEADER,
    LOCAL_PROXY_REQUEST_PURPOSE_HEADER, LOCAL_PROXY_TOKEN,
};
use serde_json::Value;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

pub(super) async fn answer(base_url: &str, body: Value, revision: u64) -> Result<String> {
    tokio::time::timeout(REQUEST_TIMEOUT, request(base_url, body, revision))
        .await
        .map_err(|_| HelpError::AnswerFailed)?
}

async fn request(base_url: &str, body: Value, revision: u64) -> Result<String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| HelpError::AnswerFailed)?;
    let mut response = client
        .post(format!("{base_url}/responses"))
        .bearer_auth(LOCAL_PROXY_TOKEN)
        .header(LOCAL_PROXY_ACTOR_AUTHORIZATION_HEADER, LOCAL_PROXY_TOKEN)
        .header(LOCAL_PROXY_REQUEST_PURPOSE_HEADER, HELP_REQUEST_PURPOSE)
        .header(HELP_ACCOUNT_REVISION_HEADER, revision.to_string())
        .header("originator", crate::codex_gui::identity::CLI_ORIGINATOR)
        .header("accept", "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|_| HelpError::AnswerFailed)?;
    if !response.status().is_success() {
        return Err(HelpError::AnswerFailed);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| HelpError::AnswerFailed)?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(HelpError::AnswerFailed);
        }
        bytes.extend_from_slice(&chunk);
    }
    parse_response(&bytes)
}

fn message_text(value: &Value) -> String {
    value["output"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item["type"] == "message")
        .filter_map(|item| item["content"].as_array())
        .flatten()
        .filter(|part| part["type"] == "output_text")
        .filter_map(|part| part["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn parse_response(bytes: &[u8]) -> Result<String> {
    let text = std::str::from_utf8(bytes).map_err(|_| HelpError::AnswerFailed)?;
    if let Ok(response) = serde_json::from_str::<Value>(text) {
        return completed_text(&response);
    }
    for line in text.lines().filter_map(|line| line.strip_prefix("data:")) {
        if line.trim() == "[DONE]" {
            continue;
        }
        let event: Value =
            serde_json::from_str(line.trim()).map_err(|_| HelpError::AnswerFailed)?;
        match event["type"].as_str() {
            Some("response.completed") => return completed_text(&event["response"]),
            Some("response.failed" | "response.incomplete" | "error") => {
                return Err(HelpError::AnswerFailed)
            }
            _ => {}
        }
    }
    Err(HelpError::AnswerFailed)
}

fn completed_text(value: &Value) -> Result<String> {
    let text = message_text(value);
    if value["status"] != "completed"
        || text.trim().is_empty()
        || text.chars().count() > MAX_ANSWER_CHARS
    {
        return Err(HelpError::AnswerFailed);
    }
    Ok(text.trim().to_owned())
}
