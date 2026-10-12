use super::{context, knowledge, prompt, tests::request, transport, types::*};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;

fn image() -> String {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(1, 1)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    format!(
        "data:image/png;base64,{}",
        STANDARD.encode(bytes.into_inner())
    )
}

#[test]
fn image_only_questions_and_history_reach_the_selected_model() {
    let mut input = request();
    input.question.clear();
    input.images = vec![image()];
    input.history = vec![HelpMessage {
        role: MessageRole::User,
        text: String::new(),
        images: vec![image()],
    }];
    assert!(input.validate().is_ok());
    let prepared = context::PreparedContext {
        base_url: String::new(),
        model: "admin-model".into(),
        system_prompt: "Admin instructions".into(),
        effort: crate::codex_gui::model_settings::Effort::Low,
        revision: 7,
        configuration: json!({}),
    };
    let body = prompt::request_body(&input, &prepared, &knowledge::retrieve("screenshot"));
    assert_eq!(body["model"], "admin-model");
    assert!(body["instructions"]
        .as_str()
        .unwrap()
        .starts_with("Admin instructions"));
    for message in body["input"].as_array().unwrap() {
        assert_eq!(message["content"][0]["type"], "input_image");
        assert_eq!(message["content"][0]["image_url"], input.images[0]);
    }
}

#[test]
fn image_validation_rejects_remote_paths_corruption_mime_mismatch_and_limits() {
    let mut input = request();
    for invalid in [
        "https://example.com/image.png".into(),
        "file:///private.png".into(),
        "data:image/svg+xml;base64,PHN2Zy8+".into(),
        "data:image/png;base64,bm90LWltYWdl".into(),
        "data:image/png;base64,!!!!".into(),
        image().replace("image/png", "image/jpeg"),
        format!("data:image/png;base64,{}", "A".repeat(7 * 1024 * 1024)),
    ] {
        input.images = vec![invalid];
        assert!(matches!(input.validate(), Err(HelpError::InvalidImage)));
    }
    input.images = vec![image(); 5];
    assert!(input.validate().is_err());
    input.images.clear();
    input.history = vec![HelpMessage {
        role: MessageRole::Assistant,
        text: "answer".into(),
        images: vec![image()],
    }];
    assert!(input.validate().is_err());
}

#[test]
fn model_errors_are_safe_and_admin_settings_have_no_local_defaults() {
    for model in ["", " ", "bad\nmodel"] {
        let settings = crate::cloud::CloudHelpSettings {
            model: model.into(),
            effort: crate::codex_gui::model_settings::Effort::Low,
            system_prompt: "Help".into(),
        };
        assert!(context::validate_settings(&settings).is_err());
    }
    for system_prompt in [String::new(), "x".repeat(16_001)] {
        let settings = crate::cloud::CloudHelpSettings {
            model: "configured".into(),
            effort: crate::codex_gui::model_settings::Effort::Low,
            system_prompt,
        };
        assert!(context::validate_settings(&settings).is_err());
    }
    let failed =
        json!({"status": "failed", "error": {"code": "model_not_found", "message": "secret-path"}});
    assert!(matches!(
        transport::parse_response(failed.to_string().as_bytes()),
        Err(HelpError::ModelUnsupported)
    ));
    let event = json!({"type": "response.failed", "response": failed});
    assert!(matches!(
        transport::parse_response(format!("data: {event}\n").as_bytes()),
        Err(HelpError::ModelUnsupported)
    ));
}
