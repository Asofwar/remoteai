use super::*;

#[test]
fn only_a_main_native_drop_grants_one_read_and_hover_preserves_it() {
    let paths = vec![std::env::temp_dir().join("dropped.txt")];
    let state = DroppedFilesState::default();
    let drop = tauri::DragDropEvent::Drop {
        paths: paths.clone(),
        position: tauri::PhysicalPosition::new(10.0, 20.0),
    };
    record_drop(&state, "file-preview", &drop);
    assert!(state.0.lock().unwrap().is_none());
    record_drop(&state, "main", &drop);
    for event in [
        tauri::DragDropEvent::Enter {
            paths: vec![PathBuf::from("other.txt")],
            position: tauri::PhysicalPosition::new(10.0, 20.0),
        },
        tauri::DragDropEvent::Leave,
    ] {
        record_drop(&state, "main", &event);
    }
    let mut pending = state.0.lock().unwrap();
    assert!(authorize(&mut pending, &paths).is_ok());
    assert!(authorize(&mut pending, &paths).is_err());
}

#[test]
fn requires_the_exact_recent_native_drop_and_consumes_it_once() {
    let paths = vec![std::env::temp_dir().join("dropped.txt")];
    let mut pending = Some(PendingDrop {
        paths: paths.clone(),
        received: Instant::now(),
    });
    assert!(authorize(&mut pending, &[PathBuf::from("unrelated.txt")]).is_err());
    assert!(authorize(&mut pending, &paths).is_ok());
    assert!(authorize(&mut pending, &paths).is_err());
    pending = Some(PendingDrop {
        paths: paths.clone(),
        received: Instant::now() - DROP_LIFETIME - Duration::from_secs(1),
    });
    assert!(authorize(&mut pending, &paths).is_err());
    assert!(authorize(&mut pending, &[]).is_err());
    assert!(authorize(&mut pending, &vec![paths[0].clone(); MAX_FILES + 1]).is_err());
}

#[test]
fn remote_drop_exports_mixed_files_and_detects_images_from_their_bytes() {
    let root = std::env::temp_dir().join(format!("drop-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let image = root.join("图片.PNG");
    let document = root.join("notes.txt");
    let bytes = b"\x89PNG\r\n\x1a\n";
    std::fs::write(&image, bytes).unwrap();
    std::fs::write(&document, "notes").unwrap();
    let response = read(DropRequest {
        paths: vec![image.clone(), document.clone()],
        mode: DropMode::Remote,
        max_bytes: Some(13),
    })
    .unwrap();
    assert!(response.references.is_empty());
    assert_eq!(response.files[0].name, "图片.PNG");
    assert_eq!(response.files[0].mime_type, "image/png");
    assert_eq!(STANDARD.decode(&response.files[0].data).unwrap(), bytes);
    assert_eq!(response.files[1].mime_type, "application/octet-stream");
    assert_eq!(STANDARD.decode(&response.files[1].data).unwrap(), b"notes");
    assert!(!serde_json::to_string(&response).unwrap().contains("path"));
    assert!(matches!(
        read(DropRequest {
            paths: vec![image.clone(), document.clone()],
            mode: DropMode::Remote,
            max_bytes: Some(12),
        }),
        Err(DropError::Size)
    ));
    assert!(matches!(
        read_file(root.clone(), &mut 100),
        Err(DropError::Folder)
    ));
    let local = read(DropRequest {
        paths: vec![image.clone(), root.clone()],
        mode: DropMode::Local,
        max_bytes: None,
    })
    .unwrap();
    let references = serde_json::to_value(local).unwrap();
    assert_eq!(references["references"][0]["kind"], "file");
    assert_eq!(references["references"][1]["kind"], "folder");
    std::fs::remove_file(image).unwrap();
    std::fs::remove_file(document).unwrap();
    std::fs::remove_dir(root).unwrap();
}

#[test]
fn rejects_invalid_paths_and_read_limits() {
    assert!(read_file(PathBuf::from("relative.txt"), &mut 100).is_err());
    assert!(read_file(
        std::env::temp_dir().join(uuid::Uuid::new_v4().to_string()),
        &mut 100
    )
    .is_err());
    for limit in [None, Some(0), Some(MAX_SAFE_INTEGER + 1)] {
        assert!(matches!(
            read(DropRequest {
                paths: vec![],
                mode: DropMode::Remote,
                max_bytes: limit,
            }),
            Err(DropError::Size)
        ));
    }
}
