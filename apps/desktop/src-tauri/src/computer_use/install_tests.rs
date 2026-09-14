use super::*;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("computer-use-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    fn home(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn installs_per_home_and_revokes_running_generations() {
    let fixture = Fixture::new();
    let first = fixture.home("first");
    let second = fixture.home("second");
    install_with(&fixture.0, &first, || Ok(())).unwrap();
    install_with(&fixture.0, &second, || Ok(())).unwrap();
    let id = state::home_id(&first);
    let generation = state::read(&fixture.0, &id).unwrap().unwrap().generation;
    assert!(state::allowed(&fixture.0, &id, &generation));
    assert!(configured(&first, true).unwrap());
    disable(&fixture.0, &first, false).unwrap();
    assert!(!state::allowed(&fixture.0, &id, &generation));
    assert!(configured(&first, false).unwrap());
    assert!(!skill_path(&first).exists());
    assert!(configured(&second, true).unwrap());
    install_with(&fixture.0, &first, || Ok(())).unwrap();
    assert!(!state::allowed(&fixture.0, &id, &generation));
    disable(&fixture.0, &first, true).unwrap();
    assert!(state::read(&fixture.0, &id).unwrap().is_none());
    assert!(configured(&second, true).unwrap());
}

#[test]
fn preserves_unrelated_config_and_refuses_foreign_entries() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    fs::create_dir_all(&home).unwrap();
    let original = "# custom settings\nmodel = 'gpt-5'\n[mcp_servers.other]\ncommand = 'other'\n";
    fs::write(home.join("config.toml"), original).unwrap();
    install_with(&fixture.0, &home, || Ok(())).unwrap();
    disable(&fixture.0, &home, true).unwrap();
    assert_eq!(
        fs::read_to_string(home.join("config.toml")).unwrap(),
        original
    );
    let foreign = format!("[mcp_servers.{MCP_SERVER}]\ncommand = 'custom'\nargs = ['mcp']\n");
    fs::write(home.join("config.toml"), &foreign).unwrap();
    assert!(matches!(
        install_with(&fixture.0, &home, || panic!("must not download")),
        Err(ComputerError::Conflict)
    ));
    assert_eq!(
        fs::read_to_string(home.join("config.toml")).unwrap(),
        foreign
    );
}

#[test]
fn failed_download_stays_disabled_and_can_be_repaired() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    assert!(install_with(&fixture.0, &home, || Err(ComputerError::Download)).is_err());
    let record = state::read(&fixture.0, &state::home_id(&home))
        .unwrap()
        .unwrap();
    assert!(!record.enabled);
    assert!(configured(&home, false).unwrap());
    install_with(&fixture.0, &home, || Ok(())).unwrap();
    assert!(configured(&home, true).unwrap());
    assert!(skill_matches(&home));
}

#[test]
fn preserves_user_skills_and_rejects_invalid_record_paths() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    fs::create_dir_all(skill_path(&home).parent().unwrap()).unwrap();
    fs::write(skill_path(&home), "user content").unwrap();
    assert!(matches!(
        install_with(&fixture.0, &home, || Ok(())),
        Err(ComputerError::Conflict)
    ));
    assert!(!home.join("config.toml").exists());
    assert!(state::path(&fixture.0, "../../elsewhere").is_err());
    assert!(state::path(&fixture.0, &"x".repeat(64)).is_err());
}

fn prepare_package(root: &Path) {
    let asset = super::super::platform::asset().unwrap();
    let directory = package::directory(root).unwrap();
    fs::create_dir_all(&directory).unwrap();
    for name in asset.files {
        fs::write(directory.join(name), "fixture").unwrap();
    }
    super::super::platform::set_executable(&package::executable(root).unwrap()).unwrap();
}

#[test]
fn restores_missing_registration_without_reinstalling_or_revoking_sessions() {
    if super::super::platform::asset().is_err() {
        return;
    }
    let fixture = Fixture::new();
    let home = fixture.home("home");
    install_with(&fixture.0, &home, || Ok(())).unwrap();
    prepare_package(&fixture.0);
    let id = state::home_id(&home);
    let generation = state::read(&fixture.0, &id).unwrap().unwrap().generation;
    fs::write(home.join("config.toml"), "# preserved\nmodel = 'custom'\n").unwrap();
    fs::remove_file(skill_path(&home)).unwrap();
    refresh_installed(&fixture.0, &home).unwrap();
    assert!(configured(&home, true).unwrap());
    assert!(skill_matches(&home));
    assert!(state::allowed(&fixture.0, &id, &generation));
    let config = fs::read_to_string(home.join("config.toml")).unwrap();
    assert!(config.starts_with("# preserved\nmodel = 'custom'\n"));
    refresh_installed(&fixture.0, &home).unwrap();
    assert_eq!(
        fs::read_to_string(home.join("config.toml")).unwrap(),
        config
    );
    disable(&fixture.0, &home, false).unwrap();
    refresh_installed(&fixture.0, &home).unwrap();
    assert!(configured(&home, false).unwrap());
    assert!(!skill_path(&home).exists());
}

#[test]
fn registration_refresh_preserves_foreign_config_and_missing_packages() {
    if super::super::platform::asset().is_err() {
        return;
    }
    let fixture = Fixture::new();
    let home = fixture.home("home");
    install_with(&fixture.0, &home, || Ok(())).unwrap();
    let foreign = format!("[mcp_servers.{MCP_SERVER}]\ncommand = 'custom'\nargs = ['mcp']\n");
    fs::write(home.join("config.toml"), &foreign).unwrap();
    refresh_installed(&fixture.0, &home).unwrap();
    prepare_package(&fixture.0);
    assert!(matches!(
        refresh_installed(&fixture.0, &home),
        Err(ComputerError::Conflict)
    ));
    assert_eq!(
        fs::read_to_string(home.join("config.toml")).unwrap(),
        foreign
    );
}

#[test]
fn skill_line_endings_do_not_require_repair() {
    let fixture = Fixture::new();
    let home = fixture.home("home");
    install_with(&fixture.0, &home, || Ok(())).unwrap();
    for content in [
        SKILL.replace("\r\n", "\n"),
        SKILL.replace("\r\n", "\n").replace('\n', "\r\n"),
    ] {
        fs::write(skill_path(&home), content).unwrap();
        assert!(skill_matches(&home));
    }
}
