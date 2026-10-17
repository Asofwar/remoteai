use super::*;

struct Fixture {
    directory: tempfile::TempDir,
    home: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let home = directory.path().join("gui-home");
        Self { directory, home }
    }

    fn root(&self) -> &Path {
        self.directory.path()
    }

    fn record(&self) -> Option<state::Record> {
        state::read(self.root(), &state::home_id(&self.home)).unwrap()
    }
}

#[test]
fn first_desktop_setup_installs_once_and_enables_both_directions() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.home).unwrap();
    fs::write(fixture.home.join("config.toml"), "model = 'existing'\n").unwrap();

    setup_home(fixture.root(), &fixture.home).unwrap();
    assert!(install::configured(&fixture.home, true).unwrap());
    let (id, token) = state::incoming(fixture.root()).unwrap();
    assert!(state::authorized(fixture.root(), &id, &token));
    let config = fs::read_to_string(fixture.home.join("config.toml")).unwrap();
    assert!(config.contains("existing"));

    setup_home(fixture.root(), &fixture.home).unwrap();
    assert_eq!(fixture.record().unwrap().token, token);
    assert_eq!(
        fs::read_to_string(fixture.home.join("config.toml")).unwrap(),
        config
    );
}

#[test]
fn existing_installation_keeps_its_credentials_and_enabled_preference() {
    for enabled in [true, false] {
        let fixture = Fixture::new();
        install::install(fixture.root(), &fixture.home).unwrap();
        let mut record = fixture.record().unwrap();
        record.enabled = enabled;
        // Model an installation saved by a version without automatic setup markers.
        state::save(fixture.root(), &record).unwrap();
        setup_home(fixture.root(), &fixture.home).unwrap();
        let current = fixture.record().unwrap();
        assert_eq!(current.enabled, enabled);
        assert_eq!(current.token, record.token);
    }
}

#[test]
fn disable_and_removal_survive_reconnect_and_startup_refresh() {
    for remove in [false, true] {
        let fixture = Fixture::new();
        setup_home(fixture.root(), &fixture.home).unwrap();
        let (id, token) = state::incoming(fixture.root()).unwrap();
        install::disable(fixture.root(), &fixture.home, remove).unwrap();

        setup_home(fixture.root(), &fixture.home).unwrap();
        install::refresh_installed(fixture.root()).unwrap();
        assert!(!state::authorized(fixture.root(), &id, &token));
        assert!(state::incoming(fixture.root()).is_err());
        assert_eq!(fixture.record().is_none(), remove);
        assert!(!install::configured(&fixture.home, true).unwrap());
    }
}

#[test]
fn removal_before_first_desktop_setup_is_remembered_but_can_be_reinstalled_manually() {
    let fixture = Fixture::new();
    install::install(fixture.root(), &fixture.home).unwrap();
    install::disable(fixture.root(), &fixture.home, true).unwrap();
    setup_home(fixture.root(), &fixture.home).unwrap();
    assert!(fixture.record().is_none());

    install::install(fixture.root(), &fixture.home).unwrap();
    setup_home(fixture.root(), &fixture.home).unwrap();
    assert!(install::configured(&fixture.home, true).unwrap());
    assert!(state::incoming(fixture.root()).is_ok());
}

#[test]
fn conflict_preserves_user_config_and_requires_manual_retry() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.home).unwrap();
    let path = fixture.home.join("config.toml");
    let config = "[mcp_servers.codex_switch_remote_command]\ncommand = 'user-owned'\n";
    fs::write(&path, config).unwrap();
    assert!(matches!(
        setup_home(fixture.root(), &fixture.home),
        Err(RemoteError::Conflict)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), config);
    fs::write(path, "").unwrap();
    setup_home(fixture.root(), &fixture.home).unwrap();
    assert!(fixture.record().is_none());

    install::install(fixture.root(), &fixture.home).unwrap();
    assert!(install::configured(&fixture.home, true).unwrap());
}

#[test]
fn damaged_record_is_preserved_for_manual_repair() {
    let fixture = Fixture::new();
    state::prepare(fixture.root()).unwrap();
    let path = state::record_path(fixture.root(), &state::home_id(&fixture.home)).unwrap();
    fs::write(&path, "invalid").unwrap();
    assert!(matches!(
        setup_home(fixture.root(), &fixture.home),
        Err(RemoteError::Storage)
    ));
    assert_eq!(fs::read_to_string(path).unwrap(), "invalid");
    assert!(!fixture.home.exists());
}
