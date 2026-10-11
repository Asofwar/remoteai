use serde::{Deserialize, Serialize};

pub(super) const MAX_QUESTION_CHARS: usize = 4_000;
pub(super) const MAX_ANSWER_CHARS: usize = 16_000;
const MAX_HISTORY_MESSAGES: usize = 12;
const MAX_HISTORY_CHARS: usize = 32_000;

#[derive(Debug, thiserror::Error)]
pub(super) enum HelpError {
    #[error("installRequired")]
    InstallRequired,
    #[error("initializeRequired")]
    InitializeRequired,
    #[error("accountRequired")]
    AccountRequired,
    #[error("accountChanged")]
    AccountChanged,
    #[error("invalidRequest")]
    InvalidRequest,
    #[error("busy")]
    Busy,
    #[error("unavailable")]
    Unavailable,
    #[error("answerFailed")]
    AnswerFailed,
}

pub(super) type Result<T> = std::result::Result<T, HelpError>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum HelpStatus {
    Ready,
    InstallRequired,
    InitializeRequired,
    AccountRequired,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HelpAvailability {
    pub(super) status: HelpStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) account_revision: Option<u64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum MessageRole {
    User,
    Assistant,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct HelpMessage {
    pub(super) role: MessageRole,
    pub(super) text: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum HelpPage {
    Accounts,
    Providers,
    CodexGui,
    Tokens,
    DreamSkin,
    Skills,
    Coze,
    Sessions,
    SystemPrompts,
    Settings,
    CodexConfig,
    LogDiagnostics,
    Downloads,
    Totp,
    ClaudeCode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HelpRequest {
    pub(super) account_revision: u64,
    pub(super) question: String,
    pub(super) history: Vec<HelpMessage>,
    pub(super) page: HelpPage,
}

impl HelpRequest {
    pub(super) fn validate(&self) -> Result<()> {
        let history_chars: usize = self
            .history
            .iter()
            .map(|entry| entry.text.chars().count())
            .sum();
        if self.question.trim().is_empty()
            || self.question.chars().count() > MAX_QUESTION_CHARS
            || self.history.len() > MAX_HISTORY_MESSAGES
            || history_chars > MAX_HISTORY_CHARS
            || self
                .history
                .iter()
                .any(|entry| entry.text.chars().count() > MAX_ANSWER_CHARS)
        {
            return Err(HelpError::InvalidRequest);
        }
        Ok(())
    }
}

#[derive(Serialize)]
pub(crate) struct HelpAnswer {
    pub(super) text: String,
    pub(super) sources: Vec<String>,
}
