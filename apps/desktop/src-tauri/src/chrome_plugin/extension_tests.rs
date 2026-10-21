use super::*;

#[test]
fn export_publishes_a_complete_bundle_and_repairs_previous_or_missing_files() {
    let root = std::env::temp_dir().join(format!("chrome-assets-{}", uuid::Uuid::new_v4()));
    assert!(!is_current(&root).unwrap());
    let path = export(&root).unwrap();
    for (name, bytes) in ASSETS {
        if *name != "bundle-version.js" {
            assert_eq!(fs::read(path.join(name)).unwrap(), *bytes);
        }
    }
    let module = fs::read_to_string(path.join("bundle-version.js")).unwrap();
    assert!(module.contains(bundle_revision()) && !module.contains(BUNDLE_PLACEHOLDER));
    assert!(is_current(&root).unwrap());
    fs::write(path.join("background.js"), "old version").unwrap();
    fs::remove_file(path.join("icon.png")).unwrap();
    fs::remove_dir_all(path.join("_locales")).unwrap();
    export(&root).unwrap();
    assert_ne!(
        fs::read_to_string(path.join("background.js")).unwrap(),
        "old version"
    );
    assert!(path.join("icon.png").is_file());
    assert!(path.join("_locales/ru/messages.json").is_file());
    // Simulate a write failure partway through an update. It must not advertise a complete bundle.
    fs::remove_file(path.join("background.js")).unwrap();
    fs::create_dir(path.join("background.js")).unwrap();
    assert!(export(&root).is_err());
    assert!(!is_current(&root).unwrap());
    fs::remove_dir(path.join("background.js")).unwrap();
    export(&root).unwrap();
    assert!(is_current(&root).unwrap());
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(path.join("manifest.json")).unwrap()).unwrap();
    assert_eq!(manifest["version"], super::super::PLUGIN_VERSION);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn bundle_contains_every_locale_and_every_referenced_extension_file() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/chrome-extension");
    let bundled = |name: &str| ASSETS.iter().any(|(asset, _)| *asset == name);
    for entry in fs::read_dir(source.join("_locales")).unwrap() {
        let locale = entry.unwrap().file_name().into_string().unwrap();
        let messages = format!("_locales/{locale}/messages.json");
        assert!(bundled(&messages), "{messages} is not bundled");
    }
    for (name, bytes) in ASSETS
        .iter()
        .filter(|(name, _)| name.ends_with(".js") || name.ends_with(".html"))
    {
        let text = String::from_utf8_lossy(bytes);
        for marker in ["from './", "src=\"", "href=\""] {
            for (start, _) in text.match_indices(marker) {
                let rest = &text[start + marker.len()..];
                let reference = &rest[..rest.find(['\'', '"']).unwrap()];
                // External pages and data URLs are not part of the bundle.
                if !reference.contains(':') {
                    assert!(
                        bundled(reference),
                        "{name} uses {reference}, which is not bundled"
                    );
                }
            }
        }
    }
}
