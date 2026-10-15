use std::{
    collections::BTreeMap,
    io::{self, BufRead, Read},
};

use serde_json::{json, Value};

use super::{continuation, response};

const MAX_EVENT_BYTES: usize = 8 * 1024 * 1024;
const MAX_CONTENT_BYTES: usize = 16 * 1024 * 1024;
const MAX_CONTENT_BLOCKS: usize = 1_024;

struct Block {
    value: Value,
    arguments: String,
    stopped: bool,
}

pub(super) struct MessagesReader<R> {
    upstream: R,
    scope: continuation::Scope,
    pending: io::Cursor<Vec<u8>>,
    data: String,
    usage: Value,
    blocks: BTreeMap<usize, Block>,
    stop_reason: Option<String>,
    started: bool,
    finished: bool,
    content_bytes: usize,
}

impl<R: BufRead> MessagesReader<R> {
    pub(super) fn new(upstream: R, scope: continuation::Scope) -> Self {
        Self {
            upstream,
            scope,
            pending: io::Cursor::new(Vec::new()),
            data: String::new(),
            usage: json!({}),
            blocks: BTreeMap::new(),
            stop_reason: None,
            started: false,
            finished: false,
            content_bytes: 0,
        }
    }

    fn emit(&mut self, value: Value) {
        self.pending = io::Cursor::new(format!("data: {value}\n\n").into_bytes());
    }

    fn fail(&mut self) {
        self.emit(json!({ "error": { "type": "api_error",
            "message": "The service response ended before it was complete." } }));
        self.finished = true;
    }

    fn process_event(&mut self) -> io::Result<()> {
        if self.data.is_empty() {
            return Ok(());
        }
        let value: Value =
            serde_json::from_str(&std::mem::take(&mut self.data)).map_err(|_| invalid_event())?;
        match value["type"].as_str() {
            Some("message_start") => self.start(&value),
            Some("content_block_start") => self.start_block(&value)?,
            Some("content_block_delta") => self.delta(&value)?,
            Some("content_block_stop") => self.stop_block(&value)?,
            Some("message_delta") => {
                if let Some(reason) = value["delta"]["stop_reason"].as_str() {
                    self.stop_reason = Some(reason.to_string());
                }
                self.merge_usage(&value["usage"]);
            }
            Some("message_stop") => self.finish()?,
            Some("error") => self.fail(),
            _ => {}
        }
        Ok(())
    }

    fn start(&mut self, value: &Value) {
        self.started = true;
        self.merge_usage(&value["message"]["usage"]);
        self.emit(
            json!({ "choices": [{ "index": 0, "delta": { "role": "assistant" } }],
            "usage": response::chat_usage(&self.usage) }),
        );
    }

    fn merge_usage(&mut self, usage: &Value) {
        if let Some(fields) = usage.as_object() {
            for (key, value) in fields {
                self.usage[key] = value.clone();
            }
        }
    }

    fn start_block(&mut self, event: &Value) -> io::Result<()> {
        let index = block_index(event)?;
        if !self.started
            || self.blocks.contains_key(&index)
            || self.blocks.len() >= MAX_CONTENT_BLOCKS
        {
            return Err(invalid_event());
        }
        let value = event["content_block"].clone();
        let delta = match value["type"].as_str() {
            Some("text") => json!({ "content": value["text"] }),
            Some("thinking") => json!({ "reasoning_content": value["thinking"] }),
            Some("redacted_thinking") => json!({}),
            Some("tool_use") => {
                let mut call = response::tool_call(&value).map_err(|_| invalid_event())?;
                call["index"] = json!(index);
                call["function"]["arguments"] = json!("");
                json!({ "tool_calls": [call] })
            }
            _ => return Err(invalid_event()),
        };
        self.content_bytes = self.content_bytes.saturating_add(value.to_string().len());
        if self.content_bytes > MAX_CONTENT_BYTES {
            return Err(invalid_event());
        }
        self.blocks.insert(
            index,
            Block {
                value,
                arguments: String::new(),
                stopped: false,
            },
        );
        self.emit(json!({ "choices": [{ "index": 0, "delta": delta }] }));
        Ok(())
    }

    fn delta(&mut self, event: &Value) -> io::Result<()> {
        let index = block_index(event)?;
        let block = self
            .blocks
            .get_mut(&index)
            .filter(|block| !block.stopped)
            .ok_or_else(invalid_event)?;
        let delta = &event["delta"];
        let (field, text, output) = match (block.value["type"].as_str(), delta["type"].as_str()) {
            (Some("text"), Some("text_delta")) => ("text", &delta["text"], "content"),
            (Some("thinking"), Some("thinking_delta")) => {
                ("thinking", &delta["thinking"], "reasoning_content")
            }
            (Some("thinking"), Some("signature_delta")) => ("signature", &delta["signature"], ""),
            (Some("tool_use"), Some("input_json_delta")) => {
                ("input", &delta["partial_json"], "tool_calls")
            }
            _ => return Ok(()),
        };
        let text = text.as_str().ok_or_else(invalid_event)?;
        self.content_bytes = self.content_bytes.saturating_add(text.len());
        if self.content_bytes > MAX_CONTENT_BYTES {
            return Err(invalid_event());
        }
        if field == "input" {
            block.arguments.push_str(text);
        } else {
            let mut existing = block.value[field].as_str().unwrap_or_default().to_string();
            existing.push_str(text);
            block.value[field] = json!(existing);
        }
        let mapped = if output == "tool_calls" {
            json!({ "tool_calls": [{ "index": index, "function": { "arguments": text } }] })
        } else if output.is_empty() {
            return Ok(());
        } else {
            json!({ (output): text })
        };
        self.emit(json!({ "choices": [{ "index": 0, "delta": mapped }] }));
        Ok(())
    }

    fn stop_block(&mut self, event: &Value) -> io::Result<()> {
        let index = block_index(event)?;
        let block = self
            .blocks
            .get_mut(&index)
            .filter(|block| !block.stopped)
            .ok_or_else(invalid_event)?;
        if block.value["type"] == "tool_use" {
            if !block.arguments.is_empty() {
                block.value["input"] =
                    serde_json::from_str(&block.arguments).map_err(|_| invalid_event())?;
            }
            if !block.value["input"].is_object() {
                return Err(invalid_event());
            }
            if block.arguments.is_empty() {
                let arguments = block.value["input"].to_string();
                self.pending = io::Cursor::new(
                    format!(
                        "data: {}\n\n",
                        json!({
                            "choices": [{ "index": 0, "delta": { "tool_calls": [{ "index": index,
                                "function": { "arguments": arguments } }] } }]
                        })
                    )
                    .into_bytes(),
                );
            }
        }
        block.stopped = true;
        Ok(())
    }

    fn finish(&mut self) -> io::Result<()> {
        let reason = self
            .stop_reason
            .as_deref()
            .filter(|_| self.started)
            .ok_or_else(invalid_event)?;
        if self.blocks.values().any(|block| !block.stopped) {
            return Err(invalid_event());
        }
        if matches!(reason, "end_turn" | "stop_sequence" | "tool_use") {
            let content = self
                .blocks
                .values()
                .map(|block| block.value.clone())
                .collect::<Vec<_>>();
            continuation::capture(&self.scope, &content);
        }
        self.emit(json!({ "choices": [{ "index": 0, "delta": {},
            "finish_reason": response::finish_reason(reason) }], "usage": response::chat_usage(&self.usage) }));
        self.finished = true;
        Ok(())
    }

    fn read_event_line(&mut self) -> io::Result<bool> {
        let mut line = String::new();
        let count = self
            .upstream
            .by_ref()
            .take((MAX_EVENT_BYTES + 1) as u64)
            .read_line(&mut line)?;
        if count == 0 {
            return Ok(false);
        }
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            self.process_event()?;
            return Ok(true);
        }
        if let Some(data) = line.strip_prefix("data:") {
            if self.data.len().saturating_add(data.len()) > MAX_EVENT_BYTES {
                return Err(invalid_event());
            }
            if !self.data.is_empty() {
                self.data.push('\n')
            }
            self.data.push_str(data.strip_prefix(' ').unwrap_or(data));
        }
        Ok(true)
    }
}

impl<R: BufRead> Read for MessagesReader<R> {
    fn read(&mut self, target: &mut [u8]) -> io::Result<usize> {
        if target.is_empty() {
            return Ok(0);
        }
        loop {
            let count = self.pending.read(target)?;
            if count > 0 || self.finished {
                return Ok(count);
            }
            match self.read_event_line() {
                Ok(true) => {}
                Ok(false) | Err(_) => self.fail(),
            }
        }
    }
}

fn block_index(event: &Value) -> io::Result<usize> {
    event["index"]
        .as_u64()
        .and_then(|index| usize::try_from(index).ok())
        .ok_or_else(invalid_event)
}

fn invalid_event() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        "The service returned an invalid message event",
    )
}
