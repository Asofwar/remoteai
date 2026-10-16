use super::super::protocol::GuiRequest;
use super::*;

fn mislabeled_png() -> (String, String) {
    let image = image::RgbaImage::from_pixel(2, 3, image::Rgba([10, 20, 30, 128]));
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, ImageFormat::Png).unwrap();
    let encoded = STANDARD.encode(bytes.into_inner());
    (
        format!("data:image/jpeg;base64,{encoded}"),
        format!("data:image/png;base64,{encoded}"),
    )
}

#[test]
fn corrects_old_queued_image_metadata_in_all_send_paths_without_changing_bytes() {
    let (source, expected) = mislabeled_png();
    for operation in ["send", "sendBatch", "steer"] {
        for mode in ["direct", "relay"] {
            let input = json!({"text": "image", "images": [source], "transferMode": mode});
            let mut request = input.clone();
            request["operation"] = json!(operation);
            request["threadId"] = json!("thread-1");
            request["turnId"] = json!("turn-1");
            request["messages"] = json!([input]);
            let (_, params) = serde_json::from_value::<GuiRequest>(request)
                .unwrap()
                .into_rpc()
                .unwrap();
            assert_eq!(
                params["input"][1],
                json!({"type": "image", "url": expected})
            );
        }
    }
}

#[test]
fn normalization_keeps_size_and_supported_format_validation() {
    let (source, _) = mislabeled_png();
    assert!(matches!(
        input_limited(source, 1),
        Err(GuiError::ImageInputTooLarge)
    ));
    for source in [
        "data:image/jpeg;base64,not-base64!".to_owned(),
        format!("data:image/jpeg;base64,{}", STANDARD.encode(b"<svg></svg>")),
        format!(
            "data:image/png;base64,{}",
            STANDARD.encode(b"BMunsupported bitmap")
        ),
        mislabeled_png().0.replace("image/jpeg", "text/html"),
    ] {
        assert!(matches!(input(source), Err(GuiError::ImageInput)));
    }
}
