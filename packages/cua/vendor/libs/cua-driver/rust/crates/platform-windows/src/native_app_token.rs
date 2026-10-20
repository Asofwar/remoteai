//! Native-app fallback when SAFER leaves administrator groups enabled (UAC off).
//!
//! This fallback is deliberately confined to `launch_app`. Isolated browsers
//! keep their existing SAFER path: restricted tokens can break Chromium's
//! renderer/GPU sandbox. We never reuse the elevated token or relax validation.

use windows::Win32::Foundation::HANDLE;
use windows::Win32::Security::{
    CreateRestrictedToken, CreateWellKnownSid, WinBuiltinAccountOperatorsSid,
    WinBuiltinAdministratorsSid, WinBuiltinBackupOperatorsSid, WinBuiltinPowerUsersSid,
    WinBuiltinPrintOperatorsSid, WinBuiltinReplicatorSid, WinBuiltinSystemOperatorsSid,
    DISABLE_MAX_PRIVILEGE, LUA_TOKEN, PSID, SID_AND_ATTRIBUTES, TOKEN_ADJUST_DEFAULT,
    TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE, TOKEN_QUERY, WELL_KNOWN_SID_TYPE,
};

use crate::browser_launch_token::{validate_standard_user_token, MEDIUM_INTEGRITY_RID};
use crate::browser_standard_user::{
    current_process_token, set_medium_integrity, token_facts, OwnedHandle,
};

// Deny-only membership also applies when Windows has no UAC-linked token.
// LUA_TOKEN handles additional administrator-group filtering on supported hosts.
const ADMINISTRATIVE_GROUPS: &[WELL_KNOWN_SID_TYPE] = &[
    WinBuiltinAdministratorsSid,
    WinBuiltinPowerUsersSid,
    WinBuiltinAccountOperatorsSid,
    WinBuiltinSystemOperatorsSid,
    WinBuiltinPrintOperatorsSid,
    WinBuiltinBackupOperatorsSid,
    WinBuiltinReplicatorSid,
];
// SECURITY_MAX_SID_SIZE is 68 bytes; u64 storage keeps native SID pointers aligned.
const SID_STORAGE_WORDS: usize = 12;

/// Derive a separate primary token for native apps and verify the same privilege
/// and integrity invariants as the normal path. The Driver's token is unchanged.
pub(crate) fn derive() -> Result<OwnedHandle, String> {
    // CreateRestrictedToken preserves the source handle's access rights.
    let source = current_process_token(
        TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_ADJUST_DEFAULT | TOKEN_ASSIGN_PRIMARY,
    )?;
    let driver = token_facts(source.raw())?;
    let mut sid_storage = [[0u64; SID_STORAGE_WORDS]; ADMINISTRATIVE_GROUPS.len()];
    let groups = administrative_sids(&mut sid_storage)?;
    let mut raw = HANDLE::default();
    // SAFETY: source and every SID buffer remain alive for this synchronous call.
    // No restricting-SID allowlist or inherited handle is added.
    unsafe {
        CreateRestrictedToken(
            source.raw(),
            DISABLE_MAX_PRIVILEGE | LUA_TOKEN,
            Some(&groups),
            None,
            None,
            &mut raw,
        )
    }
    .map_err(|error| format!("could not restrict the native-app token: {error}"))?;
    let token = OwnedHandle::new(raw);
    if token_facts(token.raw())?.integrity_rid > MEDIUM_INTEGRITY_RID {
        set_medium_integrity(token.raw())?;
    }
    validate_standard_user_token(&driver, &token_facts(token.raw())?)?;
    Ok(token)
}

fn administrative_sids(
    storage: &mut [[u64; SID_STORAGE_WORDS]; ADMINISTRATIVE_GROUPS.len()],
) -> Result<Vec<SID_AND_ATTRIBUTES>, String> {
    storage
        .iter_mut()
        .zip(ADMINISTRATIVE_GROUPS)
        .map(|(buffer, kind)| {
            let sid = PSID(buffer.as_mut_ptr().cast());
            let mut size = std::mem::size_of_val(buffer) as u32;
            // SAFETY: buffer is aligned and exceeds SECURITY_MAX_SID_SIZE.
            unsafe { CreateWellKnownSid(*kind, PSID::default(), sid, &mut size) }
                .map_err(|error| format!("could not build an administrative SID: {error}"))?;
            Ok(SID_AND_ATTRIBUTES {
                Sid: sid,
                Attributes: 0,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::browser_launch_token::{
        browser_launch_token, AdministratorsMembership, BrowserLaunchToken,
    };

    #[test]
    fn native_app_token_removes_administrators_without_changing_the_driver() {
        let source = current_process_token(TOKEN_QUERY).unwrap();
        let before = token_facts(source.raw()).unwrap();
        if browser_launch_token(&before) == BrowserLaunchToken::Driver {
            eprintln!("standard-user host; elevated-token regression requires an elevated runner");
            return;
        }
        let token = derive().expect("native fallback must work even when UAC is disabled");
        let derived = token_facts(token.raw()).unwrap();
        assert_eq!(validate_standard_user_token(&before, &derived), Ok(()));
        assert_ne!(derived.administrators, AdministratorsMembership::Enabled);
        assert!(derived.integrity_rid <= MEDIUM_INTEGRITY_RID);
        assert_cannot_modify_driver(&token);
        let after = token_facts(source.raw()).unwrap();
        assert_eq!(after.administrators, before.administrators);
        assert_eq!(after.integrity_rid, before.integrity_rid);
        assert_eq!(after.privileges, before.privileges);
    }

    fn assert_cannot_modify_driver(token: &OwnedHandle) {
        use windows::Win32::Foundation::E_ACCESSDENIED;
        use windows::Win32::System::Threading::{
            GetCurrentProcessId, OpenProcess, PROCESS_CREATE_THREAD, PROCESS_VM_WRITE,
        };
        // SAFETY: reading this process's ID does not access external memory.
        let pid = unsafe { GetCurrentProcessId() };
        let opened = crate::browser_standard_user::with_impersonation(token, || {
            // SAFETY: a valid process ID is passed and no handles are inherited.
            unsafe { OpenProcess(PROCESS_VM_WRITE | PROCESS_CREATE_THREAD, false, pid) }
        })
        .expect("restricted token impersonation");
        match opened {
            Ok(handle) => {
                drop(OwnedHandle::new(handle));
                panic!("native-app token must not be able to modify the elevated Driver");
            }
            Err(error) => assert_eq!(error.code(), E_ACCESSDENIED),
        }
    }
}
