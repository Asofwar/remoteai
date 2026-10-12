include!("accounts.rs");
include!("auto_reset.rs");
include!("lan_keys.rs");
include!("providers.rs");
mod sse_idle_timeout;
pub(crate) use sse_idle_timeout::SseIdleTimeoutSettings;
mod response_header_timeout;
pub(crate) use response_header_timeout::ResponseHeaderTimeoutSettings;
mod title_settings;
#[cfg(test)]
pub(crate) use title_settings::TitleEffort;
pub(crate) use title_settings::TitleSettings;
include!("settings.rs");
include!("cloud_sync.rs");

#[cfg(test)]
mod tests {
    include!("tests.rs");
}
