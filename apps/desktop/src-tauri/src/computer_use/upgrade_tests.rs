use super::*;
use crate::computer_use::{automatic, MCP_SERVER};
use std::{cell::Cell, fs, path::PathBuf};

struct Fixture {
    root: tempfile::TempDir,
    home: PathBuf,
}

impl Fixture {
    fn new() -> Option<Self> {
        platform::asset().ok()?;
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("home");
        fs::create_dir_all(&home).unwrap();
        let fixture = Self { root, home };
        fixture.add_legacy_home(&fixture.home, true);
        Some(fixture)
    }

    fn add_legacy_home(&self, home: &Path, enabled: bool) {
        fs::create_dir_all(home).unwrap();
        fs::create_dir_all(self.root.path().join("homes")).unwrap();
        let id = state::home_id(home);
        // Actual pre-upgrade records have no version field.
        fs::write(
            state::path(self.root.path(), &id).unwrap(),
            serde_json::to_vec(&serde_json::json!({
                "home": home, "enabled": enabled, "generation": "legacy",
            }))
            .unwrap(),
        )
        .unwrap();
        let executable = std::env::current_exe().unwrap();
        fs::write(
            home.join("config.toml"),
            format!(
                "# user setting\nmodel = 'custom'\n[mcp_servers.{MCP_SERVER}]\n\
                 command = {:?}\nargs = [\"--computer-use-mcp={id}\"]\nenabled = {enabled}\n\
                 startup_timeout_sec = 30\ntool_timeout_sec = 120\n",
                executable.to_string_lossy()
            ),
        )
        .unwrap();
        automatic::remember(self.root.path(), home).unwrap();
    }

    fn record(&self) -> state::Record {
        state::read(self.root.path(), &state::home_id(&self.home))
            .unwrap()
            .unwrap()
    }

    fn prepare_package(&self) -> Result<()> {
        let directory = package::directory(self.root.path())?;
        fs::create_dir_all(&directory).unwrap();
        for name in platform::asset()?.files {
            fs::write(directory.join(name), "fixture").unwrap();
        }
        platform::set_executable(&package::executable(self.root.path())?)
    }

    fn upgrade(&self, prepare: impl FnOnce() -> Result<()>) -> Result<()> {
        upgrade_with(self.root.path(), &self.home, prepare)
    }
}

#[test]
fn legacy_enabled_home_upgrades_once_even_with_old_setup_marker() {
    let Some(fixture) = Fixture::new() else {
        return;
    };
    let preparations = Cell::new(0);
    fixture
        .upgrade(|| {
            preparations.set(preparations.get() + 1);
            fixture.prepare_package()
        })
        .unwrap();
    let record = fixture.record();
    assert!(record.enabled);
    assert_eq!(record.version, VERSION);
    assert_ne!(record.generation, "legacy");
    assert!(install::configured(&fixture.home, true).unwrap());
    assert!(install::skill_matches(&fixture.home));
    assert!(fs::read_to_string(fixture.home.join("config.toml"))
        .unwrap()
        .starts_with("# user setting\nmodel = 'custom'\n"));
    fixture.upgrade(|| panic!("already upgraded")).unwrap();
    assert_eq!(preparations.get(), 1);
    assert_eq!(fixture.record().generation, record.generation);
}

#[test]
fn failed_download_preserves_enabled_choice_and_retries() {
    let Some(fixture) = Fixture::new() else {
        return;
    };
    let config = fs::read(fixture.home.join("config.toml")).unwrap();
    assert!(matches!(
        fixture.upgrade(|| Err(ComputerError::Download)),
        Err(ComputerError::Download)
    ));
    assert!(fixture.record().enabled);
    assert_eq!(fixture.record().generation, "legacy");
    assert_eq!(fixture.record().version, "");
    assert_eq!(fs::read(fixture.home.join("config.toml")).unwrap(), config);
    fixture.upgrade(|| fixture.prepare_package()).unwrap();
    assert_eq!(fixture.record().version, VERSION);
}

#[test]
fn disabling_or_removing_during_download_is_preserved() {
    for remove in [false, true] {
        let Some(fixture) = Fixture::new() else {
            return;
        };
        fixture
            .upgrade(|| {
                // A settings action can acquire this guard while downloading.
                let _guard = CHANGES.lock().unwrap();
                install::disable(fixture.root.path(), &fixture.home, remove)?;
                fixture.prepare_package()
            })
            .unwrap();
        let record = state::read(fixture.root.path(), &state::home_id(&fixture.home)).unwrap();
        assert!(record.is_none_or(|record| !record.enabled));
        fixture
            .upgrade(|| panic!("must preserve manual choice"))
            .unwrap();
    }
}

#[test]
fn replacing_a_generation_during_download_does_not_revoke_the_new_session() {
    let Some(fixture) = Fixture::new() else {
        return;
    };
    fixture
        .upgrade(|| {
            let mut record = fixture.record();
            record.generation = "replacement".into();
            state::save(fixture.root.path(), &record)?;
            fixture.prepare_package()
        })
        .unwrap();
    assert_eq!(fixture.record().generation, "replacement");
    assert_eq!(fixture.record().version, "");
}

#[test]
fn disabled_and_deleted_homes_are_not_reinstalled() {
    let Some(fixture) = Fixture::new() else {
        return;
    };
    let mut record = fixture.record();
    record.enabled = false;
    state::save(fixture.root.path(), &record).unwrap();
    fixture.upgrade(|| panic!("disabled")).unwrap();
    record.enabled = true;
    state::save(fixture.root.path(), &record).unwrap();
    fs::remove_dir_all(&fixture.home).unwrap();
    fixture.upgrade(|| panic!("deleted")).unwrap();
    assert!(!fixture.home.exists());
}

#[test]
fn deleting_a_home_during_download_does_not_recreate_it() {
    let Some(fixture) = Fixture::new() else {
        return;
    };
    fixture
        .upgrade(|| {
            fs::remove_dir_all(&fixture.home).unwrap();
            fixture.prepare_package()
        })
        .unwrap();
    assert!(!fixture.home.exists());
    assert_eq!(fixture.record().generation, "legacy");
    assert_eq!(fixture.record().version, "");
}

#[test]
fn every_enabled_home_adopts_the_shared_package() {
    let Some(fixture) = Fixture::new() else {
        return;
    };
    let second = fixture.root.path().join("second");
    fixture.add_legacy_home(&second, true);
    fixture.add_legacy_home(&fixture.root.path().join("disabled"), false);
    fs::write(
        fixture
            .root
            .path()
            .join("homes")
            .join(format!("{}.json", "a".repeat(64))),
        "corrupt",
    )
    .unwrap();
    fs::write(
        fixture.root.path().join("homes").join("ignored.tmp"),
        "partial",
    )
    .unwrap();
    let homes = state::installed_homes(fixture.root.path()).unwrap();
    assert_eq!(homes.len(), 2);
    fixture.upgrade(|| fixture.prepare_package()).unwrap();
    upgrade_with(fixture.root.path(), &second, || {
        assert!(package::present(fixture.root.path())?);
        Ok(())
    })
    .unwrap();
    assert!(install::skill_matches(&second));
    assert_eq!(
        state::read(fixture.root.path(), &state::home_id(&second))
            .unwrap()
            .unwrap()
            .version,
        VERSION
    );
}

#[test]
fn upstream_037_and_missing_downstream_packages_trigger_upgrade() {
    let Some(fixture) = Fixture::new() else {
        return;
    };
    let mut record = fixture.record();
    record.version = "0.37.0".into();
    state::save(fixture.root.path(), &record).unwrap();
    fixture.upgrade(|| fixture.prepare_package()).unwrap();
    assert_eq!(fixture.record().version, VERSION);
    assert_ne!(fixture.record().generation, record.generation);
    let generation = fixture.record().generation;
    fs::remove_file(package::executable(fixture.root.path()).unwrap()).unwrap();
    fixture.upgrade(|| fixture.prepare_package()).unwrap();
    assert_eq!(fixture.record().version, VERSION);
    assert_ne!(fixture.record().generation, generation);
}

#[test]
fn foreign_config_or_skill_remains_untouched_and_upgrade_can_retry() {
    for foreign_skill in [false, true] {
        let Some(fixture) = Fixture::new() else {
            return;
        };
        let path = if foreign_skill {
            fixture
                .home
                .join("skills/codex-switch-computer-use/SKILL.md")
        } else {
            fixture.home.join("config.toml")
        };
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let foreign = if foreign_skill {
            "user skill".into()
        } else {
            format!("[mcp_servers.{MCP_SERVER}]\ncommand = 'custom'\nargs = ['mcp']\n")
        };
        fs::write(&path, &foreign).unwrap();
        assert!(matches!(
            fixture.upgrade(|| fixture.prepare_package()),
            Err(ComputerError::Conflict)
        ));
        assert_eq!(fs::read_to_string(path).unwrap(), foreign);
        assert_eq!(fixture.record().generation, "legacy");
        assert_eq!(fixture.record().version, "");
        assert!(fixture.record().enabled);
    }
}

#[test]
fn current_installation_refreshes_registration_without_revoking_session() {
    let Some(fixture) = Fixture::new() else {
        return;
    };
    fixture.upgrade(|| fixture.prepare_package()).unwrap();
    let generation = fixture.record().generation;
    fs::write(fixture.home.join("config.toml"), "# preserved\n").unwrap();
    fixture.upgrade(|| panic!("package is current")).unwrap();
    assert!(install::configured(&fixture.home, true).unwrap());
    assert_eq!(fixture.record().generation, generation);
}
