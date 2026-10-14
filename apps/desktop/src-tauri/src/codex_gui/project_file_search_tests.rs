use super::*;

#[test]
fn searches_nested_paths_case_insensitively_and_returns_folder_references() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("service/src/robot")).unwrap();
    fs::write(root.join("service/src/robot/Robot.rs"), "test").unwrap();
    fs::create_dir_all(root.join("node_modules/robot")).unwrap();
    fs::create_dir_all(root.join(".git/robot")).unwrap();
    let result = search(root, "ROBOT").unwrap();
    let entries = result["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["directory"], true);
    assert_eq!(entries[0]["relativePath"], "service/src/robot");
    assert_eq!(entries[1]["relativePath"], "service/src/robot/Robot.rs");
    assert_eq!(
        entries[1]["path"],
        execution_path(
            &root
                .join("service/src/robot/Robot.rs")
                .canonicalize()
                .unwrap()
        )
    );
    assert_eq!(
        search(root, "src\\robot").unwrap()["entries"],
        result["entries"]
    );
    assert!(search(root, "absent").unwrap()["entries"]
        .as_array()
        .unwrap()
        .is_empty());
    assert!(search(root, "../").unwrap()["entries"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn bounds_results_and_validates_search_input() {
    let temp = tempfile::tempdir().unwrap();
    for index in 0..MAX_RESULTS + 1 {
        fs::write(temp.path().join(format!("file-{index}.txt")), "").unwrap();
    }
    let result = search(temp.path(), "").unwrap();
    assert_eq!(result["entries"].as_array().unwrap().len(), MAX_RESULTS);
    assert_eq!(result["truncated"], true);
    assert!(search(Path::new("relative"), "").is_err());
    assert!(search(temp.path(), "\0").is_err());
    assert!(search(temp.path(), &"x".repeat(4097)).is_err());
}

#[test]
fn does_not_follow_directory_links_outside_the_project() {
    let temp = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.txt"), "private").unwrap();
    let link = temp.path().join("external");
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), &link).unwrap();
    #[cfg(windows)]
    {
        // Junctions do not require the developer-mode privilege needed for Windows symlinks.
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(outside.path())
            .output()
            .unwrap();
        assert!(status.status.success());
    }
    assert!(search(temp.path(), "secret").unwrap()["entries"]
        .as_array()
        .unwrap()
        .is_empty());
}
