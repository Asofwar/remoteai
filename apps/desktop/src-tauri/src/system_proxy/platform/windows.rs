use reqwest::Url;

use super::super::{
    parsing::{parse_proxy_result, parse_windows_proxy},
    ProxyDecision, SystemProxyConfig,
};

pub(in crate::system_proxy) fn current_system_proxy() -> Option<SystemProxyConfig> {
    use windows_sys::Win32::{
        Foundation::GlobalFree,
        Networking::WinHttp::{
            WinHttpGetIEProxyConfigForCurrentUser, WINHTTP_CURRENT_USER_IE_PROXY_CONFIG,
        },
    };

    let mut raw = WINHTTP_CURRENT_USER_IE_PROXY_CONFIG::default();
    // Safety: WinHTTP initializes `raw`, which remains valid for the duration of the call.
    if unsafe { WinHttpGetIEProxyConfigForCurrentUser(&mut raw) } == 0 {
        return None;
    }

    let proxy_server = wide_string(raw.lpszProxy);
    let proxy_bypass = wide_string(raw.lpszProxyBypass);
    let auto_config_url = wide_string(raw.lpszAutoConfigUrl);
    let auto_detect = raw.fAutoDetect != 0;
    // Safety: these non-null strings were allocated by WinHTTP and are released exactly once.
    unsafe {
        if !raw.lpszAutoConfigUrl.is_null() {
            GlobalFree(raw.lpszAutoConfigUrl.cast());
        }
        if !raw.lpszProxy.is_null() {
            GlobalFree(raw.lpszProxy.cast());
        }
        if !raw.lpszProxyBypass.is_null() {
            GlobalFree(raw.lpszProxyBypass.cast());
        }
    }

    let mut config = parse_windows_proxy(
        proxy_server.as_deref().unwrap_or_default(),
        proxy_bypass.as_deref(),
    )
    .unwrap_or_default();
    config.auto_config_url = auto_config_url;
    config.auto_detect = auto_detect;
    (config.has_manual_proxy() || config.auto_config_url.is_some() || config.auto_detect)
        .then_some(config)
}

pub(in crate::system_proxy) fn windows_auto_proxy_for(
    config: &SystemProxyConfig,
    target: &Url,
) -> Option<ProxyDecision> {
    use std::ptr;

    use windows_sys::Win32::{
        Foundation::GlobalFree,
        Networking::WinHttp::{
            WinHttpCloseHandle, WinHttpGetProxyForUrl, WinHttpOpen, WINHTTP_ACCESS_TYPE_NO_PROXY,
            WINHTTP_PROXY_INFO,
        },
    };

    let mut url = target.as_str().encode_utf16().collect::<Vec<_>>();
    url.push(0);
    let auto_config_url = config
        .auto_config_url
        .as_deref()
        .map(|value| value.encode_utf16().chain([0]).collect::<Vec<_>>());
    let mut options = auto_proxy_options(config, auto_config_url.as_deref())?;

    // Safety: null strings select a direct WinHTTP session and all arguments outlive the call.
    let session = unsafe {
        WinHttpOpen(
            ptr::null(),
            WINHTTP_ACCESS_TYPE_NO_PROXY,
            ptr::null(),
            ptr::null(),
            0,
        )
    };
    if session.is_null() {
        return None;
    }
    let mut info = WINHTTP_PROXY_INFO::default();
    // Safety: the session, URL, options, and output storage remain valid for the synchronous call.
    let resolved = unsafe { WinHttpGetProxyForUrl(session, url.as_ptr(), &mut options, &mut info) };
    // Safety: `session` is a valid WinHTTP handle and is closed exactly once.
    unsafe {
        WinHttpCloseHandle(session);
    }
    if resolved == 0 {
        return None;
    }
    let proxy = proxy_decision(&info, target);
    // Safety: these non-null strings were allocated by WinHTTP and are released exactly once.
    unsafe {
        if !info.lpszProxy.is_null() {
            GlobalFree(info.lpszProxy.cast());
        }
        if !info.lpszProxyBypass.is_null() {
            GlobalFree(info.lpszProxyBypass.cast());
        }
    }
    proxy
}

fn auto_proxy_options(
    config: &SystemProxyConfig,
    auto_config_url: Option<&[u16]>,
) -> Option<windows_sys::Win32::Networking::WinHttp::WINHTTP_AUTOPROXY_OPTIONS> {
    use windows_sys::Win32::Networking::WinHttp::{
        WINHTTP_AUTOPROXY_AUTO_DETECT, WINHTTP_AUTOPROXY_CONFIG_URL, WINHTTP_AUTOPROXY_OPTIONS,
        WINHTTP_AUTO_DETECT_TYPE_DHCP, WINHTTP_AUTO_DETECT_TYPE_DNS_A,
    };
    let mut options = WINHTTP_AUTOPROXY_OPTIONS {
        fAutoLogonIfChallenged: 1,
        ..Default::default()
    };
    if let Some(url) = auto_config_url {
        options.dwFlags = WINHTTP_AUTOPROXY_CONFIG_URL;
        options.lpszAutoConfigUrl = url.as_ptr();
    } else if config.auto_detect {
        // An explicit PAC URL must not wait for or be replaced by WPAD discovery.
        options.dwFlags = WINHTTP_AUTOPROXY_AUTO_DETECT;
        options.dwAutoDetectFlags = WINHTTP_AUTO_DETECT_TYPE_DHCP | WINHTTP_AUTO_DETECT_TYPE_DNS_A;
    }
    (options.dwFlags != 0).then_some(options)
}

fn proxy_decision(
    info: &windows_sys::Win32::Networking::WinHttp::WINHTTP_PROXY_INFO,
    target: &Url,
) -> Option<ProxyDecision> {
    use windows_sys::Win32::Networking::WinHttp::WINHTTP_ACCESS_TYPE_NO_PROXY;

    if info.dwAccessType == WINHTTP_ACCESS_TYPE_NO_PROXY {
        return Some(ProxyDecision::Direct);
    }
    let bypass = wide_string(info.lpszProxyBypass);
    let config = SystemProxyConfig {
        bypass: bypass
            .unwrap_or_default()
            .split([';', ' '])
            .filter(|rule| !rule.is_empty())
            .map(str::to_string)
            .collect(),
        ..Default::default()
    };
    if config.should_bypass(target) {
        return Some(ProxyDecision::Direct);
    }
    wide_string(info.lpszProxy)
        .as_deref()
        .and_then(|value| parse_proxy_result(value, target))
}

fn wide_string(value: *const u16) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let mut length = 0;
    // Safety: WinHTTP returns a readable, null-terminated UTF-16 string for non-null pointers.
    unsafe {
        while *value.add(length) != 0 {
            length += 1;
        }
        Some(String::from_utf16_lossy(std::slice::from_raw_parts(
            value, length,
        )))
    }
}

#[cfg(test)]
#[path = "windows_tests.rs"]
mod tests;
