use super::*;

#[test]
fn rejects_paths_reserved_names_and_excessive_sizes() {
    let mut files = DownloadFiles::default();
    for name in [
        "", ".", "..", "../x", "C:\\x", "a/b", "a:b", "CON", "nul.txt", "LPT1.log", "a.", "a ",
    ] {
        assert!(files.begin(name, 0).is_err(), "{name}");
    }
    assert!(files.begin("test.txt", MAX_FILE_BYTES + 1).is_err());
    assert!(files.begin("报告.md", 0).is_ok());
}

#[test]
fn publishes_exact_bytes_only_when_complete_and_cleans_up_on_drop() {
    let mut files = DownloadFiles::default();
    let id = files.begin("report.txt", 5).unwrap();
    files.write(&id, &STANDARD.encode(b"hello")).unwrap();
    let (directory, path) = files.take(&id).unwrap().finish().unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), b"hello");
    files.retain(directory);
    assert!(path.exists());
    drop(files);
    assert!(!path.exists());
}

#[test]
fn rejects_incomplete_oversized_and_unknown_writes_and_cancels_temporary_files() {
    let mut files = DownloadFiles::default();
    let id = files.begin("a.txt", 3).unwrap();
    let directory = files.pending[&id].directory.path().to_owned();
    assert!(files.write(&id, &STANDARD.encode(b"long")).is_err());
    assert!(files
        .write(&id, &"A".repeat(MAX_ENCODED_BYTES + 1))
        .is_err());
    assert!(files.write("missing", "YQ==").is_err());
    files.write(&id, "YQ==").unwrap();
    assert!(files.take(&id).unwrap().finish().is_err());
    assert!(!directory.exists());
    let id = files.begin("empty.txt", 0).unwrap();
    assert!(files.take(&id).unwrap().finish().is_ok());
    let id = files.begin("cancelled.txt", 1).unwrap();
    let directory = files.pending[&id].directory.path().to_owned();
    files.cancel(&id);
    assert!(!directory.exists());
}
