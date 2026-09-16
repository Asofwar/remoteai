use super::*;
use std::path::PathBuf;

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!("csw-chrome-install-{}", uuid::Uuid::new_v4())))
    }

    fn home(&self, name: &str) -> PathBuf {
        let home = self.0.join(name);
        fs::create_dir_all(&home).unwrap();
        home
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn default_installation_is_idempotent_and_preserves_explicit_disable() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    let executable = std::env::current_exe().unwrap();
    ensure_home(&fixture.0, &home, || {
        install_home(&fixture.0, &home, &executable, || Ok(()))
    })
    .unwrap();
    assert!(configured(&home, true).unwrap());
    let client_path = config::client_path(&fixture.0, &config::client_id(&home)).unwrap();
    let original_record = fs::read(&client_path).unwrap();
    ensure_home(&fixture.0, &home, || panic!("must not reinstall")).unwrap();
    assert_eq!(fs::read(&client_path).unwrap(), original_record);
    disable(&fixture.0, &home, &executable).unwrap();
    let disabled_config = fs::read(home.join("config.toml")).unwrap();
    ensure_home(&fixture.0, &home, || panic!("must not re-enable")).unwrap();
    assert!(configured(&home, false).unwrap());
    assert_eq!(fs::read(home.join("config.toml")).unwrap(), disabled_config);
    assert!(!home.join("skills/codex-switch-chrome/SKILL.md").exists());
}

#[test]
fn default_installation_preserves_damaged_records_for_explicit_repair() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    let client_path = config::client_path(&fixture.0, &config::client_id(&home)).unwrap();
    fs::create_dir_all(client_path.parent().unwrap()).unwrap();
    fs::write(&client_path, "invalid").unwrap();
    assert!(matches!(
        ensure_home(&fixture.0, &home, || panic!("must not replace a record")),
        Err(BrowserError::Storage)
    ));
    assert_eq!(fs::read_to_string(&client_path).unwrap(), "invalid");
}

#[test]
fn install_disable_repair_and_remove_preserve_other_homes_and_settings() {
    let fixture = Fixture::new();
    let first = fixture.home("first");
    let second = fixture.home("second");
    let executable = std::env::current_exe().unwrap();
    fs::write(
        first.join("config.toml"),
        "# retained\nmodel = 'custom'\n[mcp_servers.other]\ncommand = 'other'\n",
    )
    .unwrap();
    for home in [&first, &second] {
        install_home(&fixture.0, home, &executable, || Ok(())).unwrap();
        assert!(configured(home, true).unwrap());
    }
    let second_config = fs::read(second.join("config.toml")).unwrap();
    let formatted = fs::read_to_string(first.join("config.toml"))
        .unwrap()
        .replace("enabled = true", "enabled=true # comment");
    fs::write(first.join("config.toml"), formatted).unwrap();
    assert!(configured(&first, true).unwrap());
    let first_id = config::client_id(&first);
    let token = config::load(&fixture.0, &first_id).unwrap().token;
    disable(&fixture.0, &first, &executable).unwrap();
    assert!(config::authorize(&fixture.0, &first_id, &token).is_err());
    assert!(!first.join("skills/codex-switch-chrome/SKILL.md").exists());
    install_home(&fixture.0, &first, &executable, || Ok(())).unwrap();
    assert!(config::authorize(&fixture.0, &first_id, &token).is_ok());
    remove(&fixture.0, &first).unwrap();
    let content = fs::read_to_string(first.join("config.toml")).unwrap();
    assert!(content.contains("# retained") && content.contains("model = 'custom'"));
    assert!(content.contains("mcp_servers.other") && !content.contains(MCP_SERVER));
    assert_eq!(fs::read(second.join("config.toml")).unwrap(), second_config);
    assert!(config::authorize(&fixture.0, &first_id, &token).is_err());
}

#[test]
fn foreign_configuration_or_skill_is_never_overwritten() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    let executable = std::env::current_exe().unwrap();
    let content = format!("[mcp_servers.{MCP_SERVER}]\ncommand = 'foreign'\n");
    fs::write(home.join("config.toml"), &content).unwrap();
    assert!(matches!(
        install_home(&fixture.0, &home, &executable, || Ok(())),
        Err(BrowserError::Conflict)
    ));
    assert_eq!(
        fs::read_to_string(home.join("config.toml")).unwrap(),
        content
    );
    assert!(!fixture.0.join("clients").exists());
    fs::write(home.join("config.toml"), "").unwrap();
    let skill = home.join("skills/codex-switch-chrome/SKILL.md");
    fs::create_dir_all(skill.parent().unwrap()).unwrap();
    fs::write(&skill, "user-owned").unwrap();
    assert!(install_home(&fixture.0, &home, &executable, || Ok(())).is_err());
    assert_eq!(fs::read_to_string(&skill).unwrap(), "user-owned");
    assert!(
        !config::load(&fixture.0, &config::client_id(&home))
            .unwrap()
            .enabled
    );
}

#[test]
fn incomplete_installation_fails_closed_and_can_be_repaired() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    let executable = std::env::current_exe().unwrap();
    let install = || install_home(&fixture.0, &home, &executable, || Ok(()));
    install().unwrap();
    assert!(install_home(&fixture.0, &home, &executable, || Err(
        BrowserError::Storage
    ))
    .is_err());
    assert!(
        !config::load(&fixture.0, &config::client_id(&home))
            .unwrap()
            .enabled
    );
    assert!(configured(&home, false).unwrap());
    install().unwrap();
    assert!(configured(&home, true).unwrap());
    fs::write(home.join("config.toml"), "model = 'external-edit'\n").unwrap();
    assert!(!configured(&home, true).unwrap());
    install().unwrap();
    assert!(configured(&home, true).unwrap());
}

#[test]
fn copied_managed_config_is_rebound_without_changing_the_source_home() {
    let fixture = Fixture::new();
    let source = fixture.home("source");
    let target = fixture.home("gui");
    let executable = std::env::current_exe().unwrap();
    install_home(&fixture.0, &source, &executable, || Ok(())).unwrap();
    let source_config = fs::read(source.join("config.toml")).unwrap();
    fs::write(target.join("config.toml"), &source_config).unwrap();
    install_home(&fixture.0, &target, &executable, || Ok(())).unwrap();
    assert!(configured(&target, true).unwrap());
    assert_eq!(fs::read(source.join("config.toml")).unwrap(), source_config);
    assert!(
        config::load(&fixture.0, &config::client_id(&source))
            .unwrap()
            .enabled
    );
}

#[test]
fn copied_argument_does_not_authorize_overwriting_a_foreign_executable() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    let executable = std::env::current_exe().unwrap();
    let foreign = format!(
        "[mcp_servers.{MCP_SERVER}]\ncommand = 'foreign'\nargs = ['--chrome-mcp={}']\n",
        config::client_id(&fixture.home("source"))
    );
    fs::write(home.join("config.toml"), &foreign).unwrap();
    assert!(matches!(
        install_home(&fixture.0, &home, &executable, || panic!(
            "must not install"
        )),
        Err(BrowserError::Conflict)
    ));
    assert_eq!(
        fs::read_to_string(home.join("config.toml")).unwrap(),
        foreign
    );
}

#[test]
fn invalid_config_is_not_reported_as_a_foreign_plugin() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    fs::write(home.join("config.toml"), "invalid [").unwrap();
    assert!(matches!(
        install_home(
            &fixture.0,
            &home,
            &std::env::current_exe().unwrap(),
            || panic!("must not install")
        ),
        Err(BrowserError::Storage)
    ));
}
