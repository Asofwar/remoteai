use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};

fn png() -> Vec<u8> {
    let image = image::RgbaImage::from_pixel(2, 3, image::Rgba([10, 20, 30, 128]));
    let mut bytes = Cursor::new(Vec::new());
    image.write_to(&mut bytes, ImageFormat::Png).unwrap();
    bytes.into_inner()
}

#[test]
fn clipboard_pixels_preserve_dimensions_and_transparency() {
    let image = decode_image(&png()).unwrap();
    assert_eq!(image.dimensions(), (2, 3));
    assert_eq!(image.get_pixel(0, 0).0, [10, 20, 30, 128]);
    assert!(decode_image(b"not an image").is_err());
}

#[test]
fn validates_inline_bytes_without_granting_local_file_access() {
    let bytes = png();
    let source = format!("data:image/png;base64,{}", STANDARD.encode(&bytes));
    assert_eq!(
        super::super::images::decode_data_url(&source, MAX_IMAGE_BYTES).unwrap(),
        bytes
    );
    for source in [
        "C:/private/image.png",
        "file:///C:/private/image.png",
        "data:image/png;base64,YmFk",
    ] {
        assert!(super::super::images::decode_data_url(source, MAX_IMAGE_BYTES).is_err());
    }
    assert!(super::super::images::decode_data_url(&source, 1).is_err());
    assert!(super::super::images::decode_data_url(
        &source.replace("image/png", "image/jpeg"),
        MAX_IMAGE_BYTES,
    )
    .is_err());
}

#[test]
fn chooses_extensions_from_the_original_format() {
    for (bytes, expected) in [
        (png(), "png"),
        (vec![0xff, 0xd8, 0xff], "jpg"),
        (b"GIF89a".to_vec(), "gif"),
        (b"RIFF\0\0\0\0WEBP".to_vec(), "webp"),
    ] {
        assert_eq!(extension(&bytes).unwrap(), expected);
    }
}

#[test]
fn saving_preserves_original_bytes_and_replaces_existing_files() {
    let root = std::env::temp_dir().join(format!("image-action-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let destination = root.join("图片.png");
    fs::write(&destination, b"previous").unwrap();
    let bytes = png();
    save_bytes(&bytes, &destination).unwrap();
    assert_eq!(fs::read(&destination).unwrap(), bytes);
    assert!(save_bytes(&bytes, &root).is_err());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    fs::remove_dir_all(root).unwrap();
}
