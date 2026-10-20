use super::super::output;
use super::{changes, patch, revision, tests::Repo, GitError};
use serde_json::json;
use std::{
    fs,
    io::{Read, Seek},
};

fn request(repo: &Repo, hash: &str, action: &str, mode: &str) -> revision::Request {
    let current = changes::read(&repo.0).unwrap();
    serde_json::from_value(json!({ "action": action, "mode": mode, "commit": hash,
        "head": current.head, "branch": current.branch,
        "files": current.files.iter().map(|file| json!({ "path": file.path, "version": file.version }))
            .collect::<Vec<_>>() })).unwrap()
}

fn next(repo: &Repo) -> String {
    repo.write("one.txt", "next\n");
    repo.git(&["add", "one.txt"]);
    repo.git(&["commit", "-m", "next"]);
    changes::head(&repo.0).unwrap()
}

#[test]
fn checkout_detaches_head_without_moving_branch_and_preserves_unrelated_edits() {
    let repo = Repo::new(true);
    let initial = changes::head(&repo.0).unwrap();
    let latest = next(&repo);
    repo.write("two.txt", "local edit\n");
    revision::execute(&repo.0, &request(&repo, &initial, "checkout", "mixed")).unwrap();
    let current = changes::read(&repo.0).unwrap();
    assert!(current.branch.is_none());
    assert_eq!(current.head.as_deref(), Some(initial.as_str()));
    assert_eq!(output(&repo.0, &["rev-parse", "main"]).unwrap(), latest);
    assert_eq!(
        fs::read_to_string(repo.0.join("two.txt")).unwrap(),
        "local edit\n"
    );
    assert!(matches!(
        revision::execute(&repo.0, &request(&repo, &latest, "reset", "hard")),
        Err(GitError::DetachedReset)
    ));
}

#[test]
fn reset_modes_preserve_the_promised_worktree_and_index_state() {
    for mode in ["soft", "mixed", "hard", "keep"] {
        let repo = Repo::new(true);
        let initial = changes::head(&repo.0).unwrap();
        next(&repo);
        repo.write("two.txt", "local edit\n");
        revision::execute(&repo.0, &request(&repo, &initial, "reset", mode)).unwrap();
        assert_eq!(changes::head(&repo.0).unwrap(), initial);
        assert_eq!(
            changes::read(&repo.0).unwrap().branch.as_deref(),
            Some("main")
        );
        let restored = matches!(mode, "hard" | "keep");
        assert_eq!(
            fs::read_to_string(repo.0.join("one.txt")).unwrap(),
            if restored { "one\n" } else { "next\n" }
        );
        assert_eq!(
            output(&repo.0, &["show", ":one.txt"]).unwrap(),
            if mode == "soft" { "next" } else { "one" }
        );
        assert_eq!(
            fs::read_to_string(repo.0.join("two.txt")).unwrap(),
            if mode == "hard" {
                "two\n"
            } else {
                "local edit\n"
            }
        );
    }
}

#[test]
fn rejects_stale_confirmations_invalid_revisions_and_conflicting_local_edits() {
    let repo = Repo::new(true);
    let initial = changes::head(&repo.0).unwrap();
    let latest = next(&repo);
    let pending = request(&repo, &initial, "reset", "hard");
    repo.write("one.txt", "new unsaved edit\n");
    assert!(matches!(
        revision::execute(&repo.0, &pending),
        Err(GitError::RevisionChanged)
    ));
    for action in ["checkout", "reset"] {
        assert!(revision::execute(&repo.0, &request(&repo, &initial, action, "keep")).is_err());
    }
    for hash in ["--hard", "HEAD~1", &"f".repeat(40)] {
        assert!(revision::execute(&repo.0, &request(&repo, hash, "reset", "hard")).is_err());
    }
    assert_eq!(changes::head(&repo.0).unwrap(), latest);
    assert_eq!(
        fs::read_to_string(repo.0.join("one.txt")).unwrap(),
        "new unsaved edit\n"
    );
}

#[test]
fn patch_round_trips_root_binary_and_rename_changes_without_touching_repository() {
    let repo = Repo::new(true);
    let initial = changes::head(&repo.0).unwrap();
    fs::write(repo.0.join("binary.dat"), [0, 255, 4, 0, 17]).unwrap();
    repo.git(&["mv", "one.txt", "renamed.txt"]);
    repo.git(&["add", "."]);
    repo.git(&["commit", "-m", "binary and rename"]);
    let hash = changes::head(&repo.0).unwrap();
    let mut file = patch::create(repo.0.to_str().unwrap(), &hash, 1024 * 1024).unwrap();
    file.rewind().unwrap();
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).unwrap();
    assert!(String::from_utf8_lossy(&bytes).contains("GIT binary patch"));
    assert!(changes::read(&repo.0).unwrap().files.is_empty());
    assert!(matches!(
        patch::create(repo.0.to_str().unwrap(), &hash, 1),
        Err(GitError::PatchTooLarge)
    ));
    let target = Repo::new(true);
    fs::write(target.0.join("change.patch"), &bytes).unwrap();
    target.git(&["apply", "--index", "change.patch"]);
    assert_eq!(
        fs::read(target.0.join("binary.dat")).unwrap(),
        [0, 255, 4, 0, 17]
    );
    assert!(!target.0.join("one.txt").exists());
    let mut root = patch::create(repo.0.to_str().unwrap(), &initial, 1024 * 1024).unwrap();
    root.rewind().unwrap();
    bytes.clear();
    root.read_to_end(&mut bytes).unwrap();
    let empty = Repo::new(false);
    fs::write(empty.0.join("root.patch"), bytes).unwrap();
    empty.git(&["apply", "--index", "root.patch"]);
    assert_eq!(
        fs::read_to_string(empty.0.join("one.txt")).unwrap(),
        "one\n"
    );
}
