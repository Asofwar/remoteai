use super::*;
use std::path::PathBuf;

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("draft-preview-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        Self(root)
    }

    fn preview(&self, name: &str, variant: ImageVariant) -> Result<AttachmentPreviewResponse> {
        preview(AttachmentPreviewRequest {
            path: self.0.join(name).to_string_lossy().into_owned(),
            variant,
        })
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn previews_external_draft_images_with_spaces_and_unicode_without_a_thread() {
    let fixture = Fixture::new();
    let name = "QQ 截图.PNG";
    image::RgbImage::new(2048, 457)
        .save(fixture.0.join(name))
        .unwrap();
    let thumbnail = fixture.preview(name, ImageVariant::Thumbnail).unwrap().url;
    assert!(thumbnail.starts_with("data:image/jpeg;base64,"));
    assert!(thumbnail.len() < 100_000);
    let original = fixture.preview(name, ImageVariant::Original).unwrap().url;
    let bytes = super::super::images::decode_data_url(&original, MAX_IMAGE_BYTES).unwrap();
    assert_eq!(bytes, std::fs::read(fixture.0.join(name)).unwrap());
}

#[test]
fn rejects_non_images_missing_empty_oversized_and_non_local_files() {
    let fixture = Fixture::new();
    std::fs::write(fixture.0.join("fake.png"), "not an image").unwrap();
    std::fs::write(fixture.0.join("empty.png"), "").unwrap();
    image::RgbImage::new(1, 1)
        .save(fixture.0.join("valid.png"))
        .unwrap();
    std::fs::copy(fixture.0.join("valid.png"), fixture.0.join("data.txt")).unwrap();
    std::fs::File::create(fixture.0.join("large.png"))
        .unwrap()
        .set_len(MAX_IMAGE_BYTES + 1)
        .unwrap();
    for name in [
        "fake.png",
        "empty.png",
        "missing.png",
        "large.png",
        "data.txt",
    ] {
        assert!(fixture.preview(name, ImageVariant::Thumbnail).is_err());
    }
    for path in [
        "relative.png",
        "//server/share/image.png",
        "https://example.com/image.png",
    ] {
        assert!(preview(AttachmentPreviewRequest {
            path: path.into(),
            variant: ImageVariant::Thumbnail,
        })
        .is_err());
    }
}
