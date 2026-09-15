//! Exact local image references returned by this conversation's tools.
use serde_json::Value;

const MAX_RESULT_DEPTH: usize = 12;
const MAX_JSON_TEXT_BYTES: usize = 1024 * 1024;
const IMAGE_PATH_KEYS: &[&str] = &[
    "path",
    "savedPath",
    "saved_path",
    "imagePath",
    "image_path",
    "screenshotPath",
    "screenshot_path",
    "screenshot_file_path",
    "image_url",
    "imageUrl",
    "uri",
];

pub(super) fn image_references(thread: &Value) -> Vec<String> {
    let mut references = Vec::new();
    for item in thread["turns"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|turn| turn["items"].as_array().into_iter().flatten())
    {
        collect_item(item, &mut references);
    }
    references
}

fn collect_item(item: &Value, references: &mut Vec<String>) {
    match item["type"].as_str() {
        Some("imageView") => add_path(&item["path"], references),
        Some("imageGeneration") => {
            for key in ["savedPath", "path", "result"] {
                add_path(&item[key], references);
            }
        }
        Some("userMessage") => {
            for content in item["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|content| content["type"] == "localImage")
            {
                add_path(&content["path"], references);
            }
        }
        Some("mcpToolCall" | "dynamicToolCall" | "functionCallOutput") => {
            if !item["error"].is_null() || item["success"] == false || item["status"] == "failed" {
                return;
            }
            // Arguments and arbitrary message text cannot grant filesystem access.
            for key in ["result", "contentItems", "output"] {
                collect_result(&item[key], references, 0);
            }
        }
        _ => {}
    }
}

fn add_path(value: &Value, references: &mut Vec<String>) {
    let Some(source) = value.as_str() else {
        return;
    };
    let source = local_tool_path(source);
    let Ok(path) = super::source_path(source) else {
        return;
    };
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if ["png", "jpg", "jpeg", "webp", "gif"]
        .iter()
        .any(|kind| extension.eq_ignore_ascii_case(kind))
    {
        references.push(source.to_owned());
    }
}

// Windows capture tools return canonical drive paths. Strip only their local drive prefix;
// UNC shares and device namespaces must still fail the normal source validation.
fn local_tool_path(source: &str) -> &str {
    let Some(path) = source.strip_prefix(r"\\?\") else {
        return source;
    };
    match path.as_bytes() {
        [drive, b':', b'\\', ..] if drive.is_ascii_alphabetic() => path,
        _ => source,
    }
}

fn collect_result(value: &Value, references: &mut Vec<String>, depth: usize) {
    if depth >= MAX_RESULT_DEPTH {
        return;
    }
    match value {
        Value::Object(object) => {
            if object.get("isError") == Some(&Value::Bool(true)) {
                return;
            }
            for (key, child) in object {
                if IMAGE_PATH_KEYS.contains(&key.as_str()) {
                    add_path(child, references);
                }
                if key != "arguments" {
                    collect_result(child, references, depth + 1);
                }
            }
        }
        Value::Array(values) => {
            for child in values {
                collect_result(child, references, depth + 1);
            }
        }
        Value::String(text) if text.len() <= MAX_JSON_TEXT_BYTES => {
            // Code-mode tools can wrap structured results in JSON text content.
            let trimmed = text.trim_start();
            if !trimmed.starts_with('{') && !trimmed.starts_with('[') {
                return;
            }
            if let Ok(parsed) = serde_json::from_str::<Value>(text) {
                collect_result(&parsed, references, depth + 1);
            }
        }
        _ => {}
    }
}
