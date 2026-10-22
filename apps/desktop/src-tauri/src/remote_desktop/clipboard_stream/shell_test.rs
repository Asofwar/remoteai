//! Opt-in Explorer probe: exercise the real OLE clipboard and copy UI without touching user files.
use super::*;
use std::{
    path::Path,
    time::{Duration, Instant},
};

#[test]
#[ignore = "requires an interactive Explorer paste into CODEX_CLIPBOARD_PROBE_DIR"]
fn clipboard_stream_explorer_progress_probe() {
    let directory = std::env::var_os("CODEX_CLIPBOARD_PROBE_DIR").expect("probe directory");
    let directory = Path::new(&directory).canonicalize().unwrap();
    let name = format!("native-progress-{}.bin", uuid::Uuid::new_v4());
    let size = 8 * 1024 * 1024;
    let offer = Offer {
        id: uuid::Uuid::new_v4().to_string(),
        files: vec![FileInfo {
            name: name.clone(),
            size,
        }],
    };
    let scope = format!("probe:{}", offer.id);
    let reader: Reader = Arc::new(move |request| {
        std::thread::sleep(Duration::from_millis(80));
        Ok((request.offset..request.offset + request.length as u64)
            .map(|offset| (offset % 251) as u8)
            .collect())
    });
    publish(scope.clone(), offer, reader).unwrap();
    println!("READY: paste into {} ({name})", directory.display());
    let result = wait_for_copy(&directory.join(name), size);
    release(&scope);
    result.unwrap();
}

fn wait_for_copy(path: &Path, size: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(180);
    while Instant::now() < deadline {
        if let Ok(bytes) = std::fs::read(path) {
            if bytes.len() as u64 == size
                && bytes
                    .iter()
                    .enumerate()
                    .all(|(i, byte)| *byte == (i % 251) as u8)
            {
                println!("VERIFIED: {} bytes pasted through Explorer", size);
                return Ok(());
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("Explorer paste did not complete with the expected bytes".into())
}
