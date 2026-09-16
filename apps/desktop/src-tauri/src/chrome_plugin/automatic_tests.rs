use super::*;
use std::path::PathBuf;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("chrome-update-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }

    fn home(&self, name: &str, enabled: bool) -> PathBuf {
        let home = self.0.join(name);
        fs::create_dir_all(&home).unwrap();
        config::save(
            &self.0,
            &config::client_id(&home),
            &config::ClientRecord {
                home: home.clone(),
                token: config::new_token(),
                enabled,
            },
        )
        .unwrap();
        home
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn startup_updates_existing_homes_without_changing_credentials_or_disabled_state() {
    let fixture = Fixture::new();
    let enabled = fixture.home("enabled", true);
    let disabled = fixture.home("disabled", false);
    let executable = std::env::current_exe().unwrap();
    let enabled_record =
        fs::read(config::client_path(&fixture.0, &config::client_id(&enabled)).unwrap()).unwrap();
    let disabled_record =
        fs::read(config::client_path(&fixture.0, &config::client_id(&disabled)).unwrap()).unwrap();
    fs::write(enabled.join("config.toml"), "# keep\nmodel = 'custom'\n").unwrap();
    let extension = extension::directory(&fixture.0);
    fs::create_dir_all(&extension).unwrap();
    fs::write(extension.join("background.js"), "old bundle").unwrap();
    for _ in 0..2 {
        refresh_with(&fixture.0, &executable, || Ok(())).unwrap();
        assert!(extension::is_current(&fixture.0).unwrap());
        assert!(install::configured(&enabled, true).unwrap());
        assert!(install::configured(&disabled, false).unwrap());
        assert!(enabled
            .join("skills/codex-switch-chrome/SKILL.md")
            .is_file());
        assert!(!disabled
            .join("skills/codex-switch-chrome/SKILL.md")
            .exists());
        assert_eq!(
            fs::read(config::client_path(&fixture.0, &config::client_id(&enabled)).unwrap())
                .unwrap(),
            enabled_record
        );
        assert_eq!(
            fs::read(config::client_path(&fixture.0, &config::client_id(&disabled)).unwrap())
                .unwrap(),
            disabled_record
        );
    }
    assert!(fs::read_to_string(enabled.join("config.toml"))
        .unwrap()
        .contains("# keep"));
    assert_ne!(
        fs::read_to_string(extension.join("background.js")).unwrap(),
        "old bundle"
    );
}

#[test]
fn startup_does_not_install_without_records_or_recreate_deleted_homes() {
    let fixture = Fixture::new();
    let executable = std::env::current_exe().unwrap();
    refresh_with(&fixture.0, &executable, || panic!("must not register")).unwrap();
    let deleted = fixture.home("deleted", true);
    fs::remove_dir(&deleted).unwrap();
    refresh_with(&fixture.0, &executable, || panic!("must not register")).unwrap();
    assert!(!deleted.exists());
    assert!(!extension::directory(&fixture.0).exists());
}

#[test]
fn conflicting_home_does_not_prevent_other_homes_from_updating() {
    let fixture = Fixture::new();
    let conflicting = fixture.home("conflicting", true);
    let healthy = fixture.home("healthy", true);
    let content = "[mcp_servers.codex_switch_chrome]\ncommand = 'foreign'\n";
    fs::write(conflicting.join("config.toml"), content).unwrap();
    assert!(refresh_with(&fixture.0, &std::env::current_exe().unwrap(), || Ok(())).is_err());
    assert!(install::configured(&healthy, true).unwrap());
    assert_eq!(
        fs::read_to_string(conflicting.join("config.toml")).unwrap(),
        content
    );
}
