use super::*;
#[test]
fn enforces_direction_control_and_file_permissions() {
    let policy = super::super::permissions::Permissions {
        control: false,
        clipboard_write: false,
        files: false,
        ..Default::default()
    };
    assert!(authorize(
        &policy,
        &Request::Read {
            shortcut: None,
            file_streaming: false
        }
    )
    .is_ok());
    assert!(authorize(
        &policy,
        &Request::Read {
            shortcut: Some(Shortcut::Copy),
            file_streaming: false
        }
    )
    .is_err());
    assert!(authorize(&policy, &Request::Begin { length: 5 }).is_err());
    assert!(authorize(
        &policy,
        &Request::Commit {
            paste: true,
            expected_revision: None
        }
    )
    .is_err());
    assert!(allow_content(&policy, &Content::Files { files: Vec::new() }).is_err());
    assert!(allow_content(
        &policy,
        &Content::Text {
            text: "test".into()
        }
    )
    .is_ok());
}
#[test]
fn native_gestures_need_control_but_not_clipboard_sharing() {
    let policy = super::super::permissions::Permissions {
        clipboard_read: false,
        clipboard_write: false,
        files: false,
        ..Default::default()
    };
    assert!(authorize(
        &policy,
        &Request::Copy {
            shortcut: Shortcut::Cut,
            file_streaming: false
        }
    )
    .is_ok());
    assert!(authorize(
        &policy,
        &Request::Paste {
            prefer_local: false
        }
    )
    .is_ok());
    assert!(authorize(
        &policy,
        &Request::Read {
            shortcut: None,
            file_streaming: false
        }
    )
    .is_err());
    assert!(authorize(&policy, &Request::Begin { length: 5 }).is_err());
    let view_only = super::super::permissions::Permissions {
        control: false,
        ..policy
    };
    assert!(authorize(
        &view_only,
        &Request::Copy {
            shortcut: Shortcut::Copy,
            file_streaming: false
        }
    )
    .is_err());
    assert!(authorize(
        &view_only,
        &Request::Paste {
            prefer_local: false
        }
    )
    .is_err());
}
#[test]
fn remote_changes_and_unreadable_revisions_always_preserve_the_original() {
    assert!(can_import(true, true, Some("1"), Some("1")));
    assert!(!can_import(false, true, Some("1"), Some("1")));
    assert!(!can_import(true, false, Some("1"), Some("1")));
    assert!(!can_import(true, true, Some("1"), Some("2")));
    assert!(!can_import(true, true, None, None));
}
#[test]
fn native_gesture_wire_fields_preserve_revision_guards() {
    let paste: Request = serde_json::from_str(r#"{"action":"paste","preferLocal":true}"#).unwrap();
    assert!(matches!(paste, Request::Paste { prefer_local: true }));
    let commit: Request =
        serde_json::from_str(r#"{"action":"commit","paste":true,"expectedRevision":"42"}"#)
            .unwrap();
    assert!(
        matches!(commit, Request::Commit { expected_revision: Some(value), .. } if value == "42")
    );
}
#[test]
fn rejects_oversize_reordered_and_excess_chunks() {
    assert!(Transfer::new("test".into(), vec![], Some(MAX_WIRE_BYTES + 1)).is_err());
    let mut transfer = Transfer::new("test".into(), vec![], Some(3)).unwrap();
    assert!(transfer.append(1, "YQ==").is_err());
    assert!(transfer.append(0, "YWJjZA==").is_err());
    transfer.append(0, "YWJj").unwrap();
    assert_eq!(transfer.bytes, b"abc");
    assert!(transfer.append(3, "YQ==").is_err());
    assert!(transfer.append(3, "!!!").is_err());
}
