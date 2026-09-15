use super::*;
use serde_json::json;

#[test]
fn phone_bytes_are_saved_inside_app_storage_and_not_forwarded_as_phone_paths() {
    let root = std::env::temp_dir().join(format!("csw-upload-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let mut request: GuiRequest = serde_json::from_value(json!({
        "operation": "send", "threadId": uuid::Uuid::new_v4().to_string(), "text": "", "images": [],
        "attachments": [{ "kind": "file", "name": "../../note.txt", "path": "", "data": "aGVsbG8=" }]
    })).unwrap();
    prepare_request(&mut request, &root, UploadLimits::default()).unwrap();
    let GuiRequest::Send {
        ref attachments, ..
    } = request
    else {
        panic!("send")
    };
    let target = Path::new(&attachments[0].path);
    assert!(target.canonicalize().unwrap().starts_with(&root));
    assert_eq!(fs::read(target).unwrap(), b"hello");
    assert!(attachments[0].data.is_none());
    let (_, params) = request.into_rpc().unwrap();
    assert!(params["input"].to_string().contains("note.txt"));
    assert!(!params["input"].to_string().contains("aGVsbG8="));
    assert!(root.starts_with(std::env::temp_dir().canonicalize().unwrap()));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_invalid_uploads_before_writing() {
    let root = std::env::temp_dir().join(format!("csw-invalid-upload-{}", uuid::Uuid::new_v4()));
    for attachment in [
        json!({"kind": "plugin", "name": "plugin", "path": "plugin://demo", "data": "aGVsbG8="}),
        json!({"kind": "file", "name": "note.txt", "path": "/user/file", "data": "aGVsbG8="}),
        json!({"kind": "file", "name": "note.txt", "path": "", "data": "!invalid!"}),
        json!({"kind": "file", "name": "note.txt", "path": "", "data": ""}),
        json!({"kind": "file", "name": "note.txt", "path": "", "data": "A".repeat(4 * 1024 * 1024 + 16)}),
    ] {
        let mut request = serde_json::from_value(json!({"operation": "send", "threadId": "unused",
            "text": "", "images": [], "attachments": [attachment]}))
        .unwrap();
        assert!(prepare_request(&mut request, &root, UploadLimits::default()).is_err());
        assert!(!root.exists());
    }
}

#[test]
fn decodes_uploads_above_two_mb_using_the_configured_limit() {
    let bytes = vec![1; 4 * 1024 * 1024];
    let item = serde_json::from_value(json!({
        "kind": "file", "name": "notes.txt", "path": "", "data": STANDARD.encode(&bytes)
    }))
    .unwrap();
    assert!(decode(&item, UploadLimits::default().file_bytes).is_err());
    assert_eq!(decode(&item, bytes.len()).unwrap(), bytes);
    for size in [bytes.len(), bytes.len() + 1] {
        let item = serde_json::from_value(json!({
            "kind": "file", "name": "notes.txt", "path": "", "data": STANDARD.encode(vec![1; size])
        }))
        .unwrap();
        assert_eq!(decode(&item, bytes.len()).is_ok(), size == bytes.len());
    }
}

#[test]
fn total_limits_count_decoded_bytes_and_reject_the_whole_batch_before_writing() {
    let root = std::env::temp_dir().join(format!("csw-total-upload-{}", uuid::Uuid::new_v4()));
    let file = json!({"kind": "file", "name": "notes.txt", "path": "", "data": "YQ=="});
    let mut request =
        serde_json::from_value(json!({"operation": "sendBatch", "threadId": "unused",
        "messages": [{"text": "", "images": [], "attachments": [file.clone(), file]}]}))
        .unwrap();
    assert!(prepare_request(
        &mut request,
        &root,
        UploadLimits {
            file_bytes: 1,
            total_bytes: 1
        }
    )
    .is_err());
    assert!(!root.exists());
    fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    prepare_request(
        &mut request,
        &root,
        UploadLimits {
            file_bytes: 1,
            total_bytes: 2,
        },
    )
    .unwrap();
    assert_eq!(fs::read_dir(root.join("attachments")).unwrap().count(), 2);
    assert!(root.starts_with(std::env::temp_dir().canonicalize().unwrap()));
    fs::remove_dir_all(root).unwrap();
}
