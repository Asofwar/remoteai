use std::cell::RefCell;
use std::collections::HashSet;

use tauri_plugin_global_shortcut::Shortcut;

use super::{
    model::*,
    preferences,
    registration::{self, Registry},
};

#[derive(Default)]
struct TestRegistry {
    registered: RefCell<HashSet<u32>>,
    blocked: RefCell<HashSet<u32>>,
}

impl Registry for TestRegistry {
    fn register(&self, _action: Action, shortcut: Shortcut) -> Result<(), ShortcutError> {
        if self.blocked.borrow().contains(&shortcut.id())
            || !self.registered.borrow_mut().insert(shortcut.id())
        {
            return Err(ShortcutError::Unavailable);
        }
        Ok(())
    }
    fn unregister(&self, shortcut: Shortcut) -> Result<(), ShortcutError> {
        assert!(self.registered.borrow_mut().remove(&shortcut.id()));
        Ok(())
    }
}

#[test]
fn only_screenshot_has_a_default_and_old_preferences_load() {
    let preferences: Preferences = serde_json::from_str("{}").unwrap();
    assert_eq!(
        preferences.bindings[&Action::Screenshot].as_deref(),
        Some(DEFAULT_SCREENSHOT_SHORTCUT)
    );
    assert_eq!(
        preferences
            .bindings
            .values()
            .filter(|value| value.is_some())
            .count(),
        1
    );
    assert_eq!(
        parse_shortcut(DEFAULT_SCREENSHOT_SHORTCUT).unwrap(),
        "Alt+Shift+S".parse().unwrap()
    );
}

#[test]
fn rejects_typing_keys_and_malformed_shortcuts() {
    for invalid in [
        "",
        "S",
        "Shift+S",
        "Ctrl",
        "Ctrl+Shift",
        "Ctrl+NoSuchKey",
        "Ctrl+S;calc.exe",
    ] {
        assert!(parse_shortcut(invalid).is_err(), "{invalid}");
    }
    assert!(parse_shortcut(&"x".repeat(81)).is_err());
    for valid in ["Ctrl+KeyA", "Alt+Digit1", "Super+Shift+F12"] {
        assert!(parse_shortcut(valid).is_ok(), "{valid}");
    }
}

#[test]
fn detects_duplicate_shortcuts_with_different_spelling_and_order() {
    let mut preferences = Preferences::default();
    preferences
        .bindings
        .insert(Action::OpenSettings, Some("Ctrl+Alt+KeyP".into()));
    let update = ShortcutUpdate {
        action: Action::ShowMainWindow,
        shortcut: Some("Alt+Ctrl+P".into()),
    };
    assert_eq!(
        validate_update(&preferences, &update),
        Err(ShortcutError::Duplicate)
    );
    let cleared = ShortcutUpdate {
        action: Action::OpenSettings,
        shortcut: None,
    };
    assert_eq!(validate_update(&preferences, &cleared), Ok(None));
}

#[test]
fn persistence_preserves_disabled_and_custom_bindings() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("shortcuts.json");
    let mut saved = preferences::read(&path).unwrap();
    saved.bindings.insert(Action::Screenshot, None);
    saved
        .bindings
        .insert(Action::OpenSettings, Some("Ctrl+Alt+KeyP".into()));
    preferences::save(&path, &saved).unwrap();
    assert_eq!(preferences::read(&path).unwrap().bindings, saved.bindings);
    std::fs::write(&path, "invalid json").unwrap();
    assert!(matches!(preferences::read(&path), Err(ShortcutError::Load)));
}

#[test]
fn registration_conflict_keeps_previous_binding_and_does_not_save() {
    let registry = TestRegistry::default();
    let old = parse_shortcut(DEFAULT_SCREENSHOT_SHORTCUT).unwrap();
    let next = parse_shortcut("Ctrl+Alt+KeyP").unwrap();
    registry.register(Action::Screenshot, old).unwrap();
    registry.blocked.borrow_mut().insert(next.id());
    let mut active = Some(old);
    let result = registration::replace(
        &registry,
        Action::Screenshot,
        (&mut active, Some(next)),
        || {
            panic!("conflicting shortcut must not be saved");
        },
    );
    assert_eq!(result, Err(ShortcutError::Unavailable));
    assert_eq!(active, Some(old));
    assert_eq!(*registry.registered.borrow(), HashSet::from([old.id()]));
}

#[test]
fn failed_save_restores_old_binding_for_both_replace_and_clear() {
    for next in [Some(parse_shortcut("Ctrl+Alt+KeyP").unwrap()), None] {
        let registry = TestRegistry::default();
        let old = parse_shortcut(DEFAULT_SCREENSHOT_SHORTCUT).unwrap();
        registry.register(Action::Screenshot, old).unwrap();
        let mut active = Some(old);
        assert_eq!(
            registration::replace(&registry, Action::Screenshot, (&mut active, next), || {
                Err(ShortcutError::Save)
            }),
            Err(ShortcutError::Save)
        );
        assert_eq!(active, Some(old));
        assert_eq!(*registry.registered.borrow(), HashSet::from([old.id()]));
    }
}

#[test]
fn replacing_clearing_and_reenabling_release_unused_shortcuts() {
    let registry = TestRegistry::default();
    let old = parse_shortcut(DEFAULT_SCREENSHOT_SHORTCUT).unwrap();
    let next = parse_shortcut("Ctrl+Alt+KeyP").unwrap();
    let mut active = None;
    for value in [Some(old), Some(next), Some(next), None, Some(old)] {
        registration::replace(&registry, Action::Screenshot, (&mut active, value), || {
            Ok(())
        })
        .unwrap();
        assert_eq!(active, value);
        assert_eq!(
            *registry.registered.borrow(),
            value
                .into_iter()
                .map(|key| key.id())
                .collect::<HashSet<_>>()
        );
    }
}
