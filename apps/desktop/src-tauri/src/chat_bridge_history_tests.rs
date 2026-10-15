use super::*;

fn initial_history() -> Vec<Value> {
    vec![
        json!({"role":"system", "content":"Answer in Chinese"}),
        json!({"role":"user", "content":"Read the document and summarize it"}),
    ]
}

fn assistant() -> Value {
    json!({"role":"assistant", "content":null, "reasoning_content":"Need the document",
        "tool_calls":[{"id":"read", "type":"function",
            "function":{"name":"read_document", "arguments":"{}"}}]})
}

fn result() -> Value {
    json!({"role":"tool", "tool_call_id":"read", "content":"The document describes three release steps"})
}

#[test]
fn cursor_restores_instruction_question_and_tool_result_across_multiple_turns() {
    let scope = ContinuationScope::new("complete-history", "multi-turn");
    capture_response(&scope, "first", &assistant(), &initial_history());
    let mut body = json!({"messages":[result()]});
    restore_tool_history(Some(&scope), Some("first"), &mut body).unwrap();
    assert_eq!(
        body["messages"],
        json!([
            initial_history()[0],
            initial_history()[1],
            assistant(),
            result()
        ])
    );
    capture_response(
        &scope,
        "second",
        &json!({"role":"assistant", "content":"发布分为三步。"}),
        body["messages"].as_array().unwrap(),
    );
    let mut follow_up = json!({"messages":[{"role":"user", "content":"Explain the second step"}]});
    restore_tool_history(Some(&scope), Some("second"), &mut follow_up).unwrap();
    assert_eq!(follow_up["messages"].as_array().unwrap().len(), 6);
    assert_eq!(follow_up["messages"][1], initial_history()[1]);
    assert_eq!(follow_up["messages"][3], result());
    assert_eq!(follow_up["messages"][4]["content"], "发布分为三步。");
}

#[test]
fn full_history_is_not_duplicated_when_assistant_metadata_is_omitted() {
    let scope = ContinuationScope::new("complete-history", "full");
    capture_response(&scope, "full", &assistant(), &initial_history());
    let mut supplied = assistant();
    supplied
        .as_object_mut()
        .unwrap()
        .remove("reasoning_content");
    supplied.as_object_mut().unwrap().remove("content");
    let mut body =
        json!({"messages":[initial_history()[0], initial_history()[1], supplied, result()]});
    let original = body.clone();
    restore_tool_history(Some(&scope), Some("full"), &mut body).unwrap();
    assert_eq!(body, original);
}

#[test]
fn new_instructions_replace_cached_instructions_without_losing_the_question() {
    let scope = ContinuationScope::new("complete-history", "instructions");
    capture_response(&scope, "instructions", &assistant(), &initial_history());
    let mut body = json!({"messages":[{"role":"system", "content":"Answer in English"}, result()]});
    restore_tool_history(Some(&scope), Some("instructions"), &mut body).unwrap();
    assert_eq!(body["messages"].as_array().unwrap().len(), 4);
    assert_eq!(body["messages"][0]["content"], "Answer in English");
    assert_eq!(body["messages"][1], initial_history()[1]);
}

#[test]
fn without_cursor_only_missing_tool_declarations_are_recovered() {
    let scope = ContinuationScope::new("complete-history", "no-cursor");
    capture_response(&scope, "no-cursor", &assistant(), &initial_history());
    let mut body = json!({"messages":[result()]});
    restore_tool_history(Some(&scope), None, &mut body).unwrap();
    assert_eq!(body["messages"].as_array().unwrap().len(), 2);
    assert_eq!(body["messages"][0], assistant());
}

#[test]
fn expired_or_foreign_cursors_cannot_silently_drop_previous_text_turns() {
    let scope = ContinuationScope::new("complete-history", "text-only");
    capture_response(
        &scope,
        "text-only",
        &json!({"role":"assistant", "content":"Summary"}),
        &initial_history(),
    );
    let mut body = json!({"messages":[{"role":"user", "content":"Continue"}]});
    assert!(restore_tool_history(Some(&scope), Some("missing"), &mut body).is_err());
    assert!(restore_tool_history(
        Some(&ContinuationScope::new("other", "text-only")),
        Some("text-only"),
        &mut body
    )
    .is_err());
    restore_tool_history(Some(&scope), Some("text-only"), &mut body).unwrap();
    assert_eq!(body["messages"].as_array().unwrap().len(), 4);
}
