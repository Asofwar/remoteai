use super::super::output;
use super::{
    changes,
    file_actions::{self, Action},
    tests::Repo,
    GitError, SelectedFile,
};
use std::fs;

fn selection(repo: &Repo, paths: &[&str]) -> (Option<String>, Vec<SelectedFile>) {
    let state = changes::read(&repo.0).unwrap();
    let selected = paths
        .iter()
        .map(|path| {
            let file = state.files.iter().find(|file| file.path == *path).unwrap();
            SelectedFile {
                path: file.path.clone(),
                version: file.version.clone(),
            }
        })
        .collect();
    (state.head, selected)
}

fn apply(repo: &Repo, action: Action, paths: &[&str]) {
    let (head, files) = selection(repo, paths);
    file_actions::execute(&repo.0, head.as_deref(), action, &files).unwrap();
}

#[test]
fn rollback_restores_selected_staged_and_unstaged_content_only() {
    let repo = Repo::new(true);
    repo.write("one.txt", "selected staged\n");
    repo.write("two.txt", "unrelated staged\n");
    repo.git(&["add", "."]);
    repo.write("one.txt", "selected unstaged\n");
    repo.write("two.txt", "unrelated unstaged\n");
    apply(&repo, Action::Rollback, &["one.txt"]);
    assert_eq!(fs::read_to_string(repo.0.join("one.txt")).unwrap(), "one\n");
    assert_eq!(output(&repo.0, &["show", ":one.txt"]).unwrap(), "one");
    assert_eq!(
        output(&repo.0, &["show", ":two.txt"]).unwrap(),
        "unrelated staged"
    );
    assert_eq!(
        fs::read_to_string(repo.0.join("two.txt")).unwrap(),
        "unrelated unstaged\n"
    );
    assert_eq!(changes::read(&repo.0).unwrap().files.len(), 1);
}

#[test]
fn rollback_removes_only_selected_new_files_with_literal_names_and_without_head() {
    for initial in [true, false] {
        let repo = Repo::new(initial);
        repo.write("新增 [1].txt", "new\n");
        repo.write("新增 1.txt", "keep\n");
        repo.write("staged.txt", "staged\n");
        repo.git(&["add", "staged.txt"]);
        apply(&repo, Action::Rollback, &["新增 [1].txt", "staged.txt"]);
        assert!(!repo.0.join("新增 [1].txt").exists());
        assert!(!repo.0.join("staged.txt").exists());
        assert!(repo.0.join("新增 1.txt").exists());
        let state = changes::read(&repo.0).unwrap();
        assert_eq!(state.files.len(), 1);
        assert_eq!(state.files[0].path, "新增 1.txt");
    }
}

#[test]
fn rollback_restores_deleted_files_and_rename_sources() {
    let repo = Repo::new(true);
    repo.git(&["mv", "one.txt", "renamed [1].txt"]);
    repo.git(&["rm", "two.txt"]);
    apply(&repo, Action::Rollback, &["renamed [1].txt", "two.txt"]);
    assert!(!repo.0.join("renamed [1].txt").exists());
    assert_eq!(fs::read_to_string(repo.0.join("one.txt")).unwrap(), "one\n");
    assert_eq!(fs::read_to_string(repo.0.join("two.txt")).unwrap(), "two\n");
    assert!(changes::read(&repo.0).unwrap().files.is_empty());
}

#[test]
fn delete_removes_the_file_without_committing_or_touching_staging() {
    let repo = Repo::new(true);
    repo.write("one.txt", "staged\n");
    repo.git(&["add", "one.txt"]);
    repo.write("two.txt", "keep\n");
    repo.write("new.txt", "new\n");
    let head = changes::head(&repo.0);
    let staged = output(&repo.0, &["diff", "--cached"]).unwrap();
    apply(&repo, Action::Delete, &["one.txt", "new.txt"]);
    assert!(!repo.0.join("one.txt").exists());
    assert!(!repo.0.join("new.txt").exists());
    assert_eq!(
        fs::read_to_string(repo.0.join("two.txt")).unwrap(),
        "keep\n"
    );
    assert_eq!(changes::head(&repo.0), head);
    assert_eq!(output(&repo.0, &["diff", "--cached"]).unwrap(), staged);
}

#[test]
fn stale_selection_and_head_reject_the_entire_batch_before_mutation() {
    let repo = Repo::new(true);
    repo.write("one.txt", "first\n");
    repo.write("two.txt", "second\n");
    let (head, files) = selection(&repo, &["one.txt", "two.txt"]);
    repo.write("two.txt", "changed during confirmation\n");
    for action in [Action::Rollback, Action::Delete] {
        assert!(matches!(
            file_actions::execute(&repo.0, head.as_deref(), action, &files),
            Err(GitError::Changed)
        ));
        assert_eq!(
            fs::read_to_string(repo.0.join("one.txt")).unwrap(),
            "first\n"
        );
        assert!(!repo.0.join(".git/index.lock").exists());
    }
    let (_, files) = selection(&repo, &["one.txt"]);
    assert!(matches!(
        file_actions::execute(&repo.0, None, Action::Rollback, &files),
        Err(GitError::Changed)
    ));
}

#[test]
fn rejects_unselected_recreated_rename_sources_and_external_paths() {
    let repo = Repo::new(true);
    repo.git(&["mv", "one.txt", "renamed.txt"]);
    repo.write("one.txt", "keep new content\n");
    let (head, files) = selection(&repo, &["renamed.txt"]);
    assert!(matches!(
        file_actions::execute(&repo.0, head.as_deref(), Action::Rollback, &files),
        Err(GitError::Changed)
    ));
    assert_eq!(
        fs::read_to_string(repo.0.join("one.txt")).unwrap(),
        "keep new content\n"
    );
    let files = [SelectedFile {
        path: "../outside.txt".into(),
        version: "fake".into(),
    }];
    assert!(file_actions::execute(&repo.0, head.as_deref(), Action::Delete, &files).is_err());
}

#[test]
fn rejects_busy_index_and_unfinished_merge() {
    let repo = Repo::new(true);
    repo.write("one.txt", "keep\n");
    let (head, files) = selection(&repo, &["one.txt"]);
    repo.write(".git/index.lock", "owned elsewhere");
    assert!(matches!(
        file_actions::execute(&repo.0, head.as_deref(), Action::Delete, &files),
        Err(GitError::Locked)
    ));
    assert_eq!(
        fs::read_to_string(repo.0.join(".git/index.lock")).unwrap(),
        "owned elsewhere"
    );
    fs::remove_file(repo.0.join(".git/index.lock")).unwrap();
    repo.write(".git/MERGE_HEAD", head.as_deref().unwrap());
    assert!(matches!(
        file_actions::execute(&repo.0, head.as_deref(), Action::Rollback, &files),
        Err(GitError::Conflict)
    ));
    assert_eq!(
        fs::read_to_string(repo.0.join("one.txt")).unwrap(),
        "keep\n"
    );
}

#[test]
fn refuses_directory_replacements_before_removing_other_files() {
    let repo = Repo::new(true);
    fs::remove_file(repo.0.join("one.txt")).unwrap();
    fs::create_dir(repo.0.join("one.txt")).unwrap();
    repo.write("one.txt/keep.txt", "keep\n");
    repo.write("new.txt", "keep new\n");
    let (head, files) = selection(&repo, &["new.txt", "one.txt"]);
    assert!(matches!(
        file_actions::execute(&repo.0, head.as_deref(), Action::Rollback, &files),
        Err(GitError::File)
    ));
    assert!(repo.0.join("new.txt").exists());
    assert!(repo.0.join("one.txt/keep.txt").exists());
}
