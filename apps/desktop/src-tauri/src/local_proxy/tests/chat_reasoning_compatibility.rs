fn reasoning_test_stream(
    events: &[Value],
    scope: Option<chat_bridge_continuation::ContinuationScope>,
) -> String {
    let source = chat_status_sse(events, true);
    let mut reader = ChatSseReader::new(
        BufReader::new(std::io::Cursor::new(source.into_bytes())),
        "reasoning-test".into(),
        CodexToolContext::default(),
        scope,
    );
    let mut result = String::new();
    reader.read_to_string(&mut result).unwrap();
    result
}

#[test]
fn chat_reasoning_inline_nonstream_roundtrip_keeps_tools_and_literal_body_markup() {
    let response = chat_to_responses_json(
        &json!({ "choices": [{ "finish_reason": "tool_calls", "message": {
        "content": "<thinking>inspect first</thinking>Use <think>literally</think>",
        "tool_calls": [{ "id": "first", "function": { "name": "lookup", "arguments": "{}" } }]
    } }] }),
        &CodexToolContext::default(),
        None,
    );
    assert_eq!(response["output"][0]["summary"][0]["text"], "inspect first");
    assert_eq!(
        response["output"][1]["content"][0]["text"],
        "Use <think>literally</think>"
    );
    let mut input = response["output"].as_array().unwrap().clone();
    input.push(json!({ "type": "function_call_output", "call_id": "first", "output": "found" }));
    input.push(json!({ "type": "function_call", "call_id": "second", "name": "lookup", "arguments": "{}" }));
    input.push(json!({ "type": "function_call_output", "call_id": "second", "output": "done" }));
    let request = responses_to_chat_completions(&json!({ "input": input }));
    assert_eq!(request["messages"][0]["reasoning_content"], "inspect first");
    assert_eq!(request["messages"][2]["reasoning_content"], "inspect first");
    assert_eq!(request["messages"][0]["tool_calls"][0]["id"], "first");
    assert_eq!(request["messages"][2]["tool_calls"][0]["id"], "second");
}

#[test]
fn chat_reasoning_stream_preserves_output_indices_with_interleaved_tools() {
    let result = reasoning_test_stream(
        &[
            json!({ "choices": [{ "delta": { "content": "<thi", "tool_calls": [
            { "index": 3, "id": "lookup", "function": { "name": "find", "arguments": "{" } }
        ] } }] }),
            json!({ "choices": [{ "delta": { "content": "nk>分析</th", "tool_calls": [
            { "index": 3, "function": { "arguments": "}" } }
        ] } }] }),
            json!({ "choices": [{ "delta": { "content": "ink>answer" }, "finish_reason": "tool_calls" }] }),
        ],
        None,
    );
    let completed = sse_event(&result, "response.completed");
    let items = completed["response"]["output"].as_array().unwrap();
    assert_eq!(items[0]["type"], "function_call");
    assert_eq!(items[0]["call_id"], "lookup");
    assert_eq!(items[1]["summary"][0]["text"], "分析");
    assert_eq!(items[2]["content"][0]["text"], "answer");
    assert_eq!(
        sse_event(&result, "response.reasoning_summary_text.delta")["output_index"],
        1
    );
    assert_eq!(
        sse_event(&result, "response.output_text.delta")["output_index"],
        2
    );
}

#[test]
fn chat_reasoning_stream_flushes_incomplete_markers_on_failure_and_truncation() {
    let source = chat_status_sse(
        &[json!({ "choices": [{ "delta": { "content": "<thi" } }] })],
        false,
    );
    let result = chat_sse_to_responses_sse(&source, "reasoning-test");
    assert_eq!(
        sse_event(&result, "response.failed")["response"]["output"][0]["content"][0]["text"],
        "<thi"
    );
    let source = chat_status_sse(
        &[json!({ "choices": [{ "delta": {
        "content": "<think>unfinished</thi"
    }, "finish_reason": "length" }] })],
        true,
    );
    let result = chat_sse_to_responses_sse(&source, "reasoning-test");
    let incomplete = sse_event(&result, "response.incomplete");
    assert_eq!(
        incomplete["response"]["output"][0]["summary"][0]["text"],
        "unfinished</thi"
    );
    assert_eq!(
        incomplete["response"]["incomplete_details"]["reason"],
        "max_output_tokens"
    );
}

#[test]
fn chat_reasoning_opaque_details_roundtrip_is_scoped_and_does_not_leak_into_text() {
    let scope = chat_bridge_continuation::ContinuationScope::new(
        "opaque-test",
        &uuid::Uuid::new_v4().to_string(),
    );
    let details = json!([{ "type": "reasoning.encrypted", "data": "ciphertext" },
        { "type": "future", "text": "not-display-text", "metadata": { "version": 4 } }]);
    let context = CodexToolContext::default();
    let response = chat_to_responses_json(
        &json!({ "choices": [{ "message": {
        "content": "answer", "reasoning_details": details
    }, "finish_reason": "stop" }] }),
        &context,
        Some(&scope),
    );
    assert_eq!(response["output"][0]["summary"], json!([]));
    assert!(!response.to_string().contains("ciphertext"));
    assert!(!response.to_string().contains("not-display-text"));
    let mut input = response["output"].as_array().unwrap().clone();
    input.push(
        json!({ "type": "function_call", "call_id": "next", "name": "lookup", "arguments": "{}" }),
    );
    input.push(json!({ "type": "function_call_output", "call_id": "next", "output": "result" }));
    input.push(json!({ "role": "user", "content": "new turn" }));
    input.push(json!({ "role": "assistant", "content": "new answer" }));
    let request = json!({ "input": input });
    let replay = responses_to_chat_completions_with_context(&request, &context, Some(&scope));
    assert_eq!(replay["messages"][0]["reasoning_details"], details);
    assert!(replay["messages"][3].get("reasoning_details").is_none());
    let foreign = chat_bridge_continuation::ContinuationScope::new("foreign", "other-session");
    let replay = responses_to_chat_completions_with_context(&request, &context, Some(&foreign));
    assert!(replay["messages"][0].get("reasoning_details").is_none());
}

#[test]
fn chat_reasoning_stream_replays_details_and_tool_signatures_after_compaction() {
    let scope = chat_bridge_continuation::ContinuationScope::new(
        "details-test",
        &uuid::Uuid::new_v4().to_string(),
    );
    let result = reasoning_test_stream(
        &[
            json!({ "choices": [{ "delta": { "reasoning_details": [
            { "type": "reasoning.text", "index": 0, "text": "inspect" }
        ] } }] }),
            json!({ "choices": [{ "delta": { "reasoning_details": [
            { "type": "reasoning.text", "index": 0, "text": " files", "signature": "proof" },
            { "type": "reasoning.encrypted", "data": "opaque-proof" }
        ], "tool_calls": [{ "index": 0, "id": "lookup", "function": { "name": "find", "arguments": "{}" },
            "extra_content": { "google": { "thought_signature": "tool-proof" } } }] },
            "finish_reason": "tool_calls" }] }),
        ],
        Some(scope.clone()),
    );
    let completed = sse_event(&result, "response.completed");
    let mut input = completed["response"]["output"].as_array().unwrap().clone();
    input.retain(|item| item["type"] != "reasoning");
    input.push(json!({ "type": "function_call_output", "call_id": "lookup", "output": "found" }));
    let replay = responses_to_chat_completions_with_context(
        &json!({ "input": input }),
        &CodexToolContext::default(),
        Some(&scope),
    );
    let assistant = replay["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item.get("tool_calls").is_some())
        .unwrap();
    assert_eq!(assistant["reasoning_content"], "inspect files");
    assert_eq!(assistant["reasoning_details"][0]["text"], "inspect files");
    assert_eq!(assistant["reasoning_details"][0]["signature"], "proof");
    assert_eq!(assistant["reasoning_details"][1]["data"], "opaque-proof");
    assert_eq!(
        assistant["tool_calls"][0]["extra_content"]["google"]["thought_signature"],
        "tool-proof"
    );
}
