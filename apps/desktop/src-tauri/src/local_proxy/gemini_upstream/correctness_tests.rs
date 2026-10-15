use super::{continuation, history, request, response, tests::context};
use serde_json::{json, Value};

#[test]
fn unsupported_tool_constraints_are_never_relaxed() {
    let base = json!({"input":"Hi","tools":[{"type":"function","name":"run","parameters":{"type":"object"}}]});
    for (field, value) in [
        ("parallel_tool_calls", json!(false)),
        ("max_tool_calls", json!(2)),
        ("tool_choice", json!({"type":"allowed_tools","tools":[]})),
        ("tool_choice", json!({"type":"function","name":"missing"})),
    ] {
        let mut input = base.clone();
        input[field] = value;
        assert!(
            request::convert(&input, &context(&input)).is_err(),
            "{field}"
        );
    }
    for choice in [json!("required"), json!({"type":"web_search"})] {
        let input = json!({"input":"Hi","tools":[{"type":"web_search"}],"tool_choice":choice});
        assert!(request::convert(&input, &context(&input)).is_err());
    }
}

#[test]
fn disabling_tools_removes_builtin_search_and_ignores_inactive_limits() {
    let input = json!({"input":"Hi","tools":[{"type":"web_search","max_uses":1}],
        "tool_choice":"none","max_tool_calls":1,"parallel_tool_calls":false});
    let body = request::convert(&input, &context(&input)).unwrap();
    assert!(body.get("tools").is_none());
    let enabled = json!({"input":"Hi","tools":[{"type":"web_search","max_uses":1}]});
    assert!(request::convert(&enabled, &context(&enabled)).is_err());
}

#[test]
fn signed_parts_survive_reused_calls_and_ambiguous_unsigned_history_is_unchanged() {
    let scope = continuation::Scope::fixture("reused-signature-regression");
    let first = vec![
        json!({"functionCall":{"id":"same","name":"run","args":{}},"thoughtSignature":"first"}),
    ];
    let second = vec![
        json!({"functionCall":{"id":"same","name":"run","args":{}},"thoughtSignature":"second"}),
    ];
    continuation::capture(Some(&scope), &first, &["same".into()]);
    continuation::capture(Some(&scope), &second, &["same".into()]);
    let mut signed = first.clone();
    continuation::restore(Some(&scope), &mut signed);
    assert_eq!(signed, first);
    let mut unsigned = vec![json!({"functionCall":{"id":"same","name":"run","args":{}}})];
    let original = unsigned.clone();
    continuation::restore(Some(&scope), &mut unsigned);
    assert_eq!(unsigned, original);
}

#[test]
fn previous_cursor_with_full_transcript_preserves_original_signed_turn_without_duplication() {
    let input = json!({"previous_response_id":"previous","input":[
        {"role":"developer","content":"Rules"},
        {"role":"user","content":"Original user"},
        {"type":"function_call","call_id":"call","name":"run","arguments":"{}"},
        {"type":"function_call_output","call_id":"call","output":"done"}
    ]});
    let mut context = context(&input);
    let signed = json!({"role":"model","parts":[
        {"text":"","thoughtSignature":"empty-signed"},
        {"functionCall":{"id":"call","name":"run","args":{}},"thoughtSignature":"original-signed"}
    ]});
    context.previous = Some(history::Snapshot {
        contents: vec![
            json!({"role":"user","parts":[{"text":"Original user"}]}),
            signed.clone(),
        ],
        system: vec![json!({"text":"Rules"})],
        calls: [("call".into(), "run".into())].into(),
        tools: Default::default(),
    });
    let result = request::convert(&input, &context).unwrap();
    assert_eq!(result["contents"].as_array().unwrap().len(), 3);
    assert_eq!(result["contents"][1], signed);
    assert_eq!(
        result["systemInstruction"]["parts"],
        json!([{"text":"Rules"}])
    );
}

#[test]
fn signed_unsupported_output_cannot_be_reported_as_empty_success() {
    let context = context(&json!({}));
    for part in [
        json!({"inlineData":{"mimeType":"image/png","data":"aA=="},"thoughtSignature":"signed"}),
        json!({"fileData":{"fileUri":"https://example.com/image.png"},"thoughtSignature":"signed"}),
        json!({"executableCode":{"code":"run"},"thoughtSignature":"signed"}),
    ] {
        assert!(response::to_chat(
            &json!({"candidates":[{"content":{"parts":[part]},"finishReason":"STOP"}]}),
            &context
        )
        .is_err());
    }
}

fn grounded_response() -> Value {
    json!({"candidates":[{"content":{"parts":[{"text":"中文来源"}]},"finishReason":"STOP",
        "groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://example.com/source","title":"Source"}}],
            "groundingSupports":[{"segment":{"startIndex":0,"endIndex":6,"text":"中文"},"groundingChunkIndices":[0]}]}
    }]})
}

#[test]
fn buffered_grounding_reaches_responses_text_annotations() {
    let context = context(&json!({}));
    let chat = response::to_chat(&grounded_response(), &context).unwrap();
    let converted = super::super::chat_to_responses_json(&chat, &context.tools, None);
    let citation = &converted["output"][0]["content"][0]["annotations"][0];
    assert_eq!(citation["url"], "https://example.com/source");
    assert_eq!(citation["end_index"], 2);
}

#[test]
fn streamed_grounding_emits_annotation_event_and_final_annotation() {
    use std::io::{BufReader, Cursor, Read};
    let native = format!("data: {}\n\n", grounded_response());
    let reader = super::stream::GenerateContentReader::new(Cursor::new(native.into_bytes()), None);
    let mut reader = super::super::ChatSseReader::new(
        BufReader::new(reader),
        "gemini".into(),
        Default::default(),
        None,
    );
    let mut output = String::new();
    reader.read_to_string(&mut output).unwrap();
    assert!(output.contains("event: response.output_text.annotation.added"));
    let final_response = super::stream_tests::terminal(&output);
    assert_eq!(
        final_response["output"][0]["content"][0]["annotations"][0]["url"],
        "https://example.com/source"
    );
}
