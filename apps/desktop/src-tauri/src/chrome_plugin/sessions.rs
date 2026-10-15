//! A dedicated TCP lease survives tool-call gaps and ends when the MCP process exits.
use std::{
    collections::HashMap,
    io::{self, Read},
    net::TcpStream,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use serde::{Deserialize, Serialize};

use super::{config, native, protocol::*, transport, BrowserError, Result};

const CHECK_INTERVAL: Duration = Duration::from_millis(250);

#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(super) enum SessionRequest {
    Session {
        #[serde(rename = "clientId")]
        client_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        token: String,
    },
}

#[derive(Deserialize)]
#[serde(untagged)]
pub(super) enum HostRequest {
    Session(SessionRequest),
    Call(BridgeRequest),
}

pub(super) struct ClientSessions {
    pub(super) id: String,
    streams: HashMap<String, TcpStream>,
}

impl Default for ClientSessions {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            streams: HashMap::new(),
        }
    }
}

impl ClientSessions {
    pub(super) fn ensure(&mut self, endpoint: &Endpoint, request: &BridgeRequest) -> Result<()> {
        if let Some(stream) = self.streams.get(&endpoint.id) {
            stream
                .set_nonblocking(true)
                .map_err(|_| BrowserError::Transport)?;
            let active = matches!(stream.peek(&mut [0]), Err(error) if error.kind() == io::ErrorKind::WouldBlock);
            stream
                .set_nonblocking(false)
                .map_err(|_| BrowserError::Transport)?;
            if active {
                return Ok(());
            }
        }
        let mut stream = native::connect(endpoint).map_err(|_| BrowserError::Disconnected)?;
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .map_err(|_| BrowserError::Transport)?;
        stream
            .set_write_timeout(Some(Duration::from_secs(2)))
            .map_err(|_| BrowserError::Transport)?;
        let registration = SessionRequest::Session {
            client_id: request.client_id.clone(),
            session_id: self.id.clone(),
            token: request.token.clone(),
        };
        transport::write_frame(&mut stream, &registration, transport::MAX_REQUEST_BYTES)?;
        let reply: BrowserReply =
            transport::read_frame(&mut stream, transport::MAX_RESPONSE_BYTES)?
                .ok_or(BrowserError::Disconnected)?;
        if reply.error.is_some() {
            return Err(BrowserError::Unauthorized);
        }
        self.streams.insert(endpoint.id.clone(), stream);
        Ok(())
    }
}

/// Never expire a live MCP session merely because its agent is thinking or using another tool.
pub(super) fn wait(
    stream: &mut TcpStream,
    root: &Path,
    request: &SessionRequest,
    alive: &AtomicBool,
) -> Result<()> {
    let SessionRequest::Session {
        client_id, token, ..
    } = request;
    stream
        .set_read_timeout(Some(CHECK_INTERVAL))
        .map_err(|_| BrowserError::Transport)?;
    while alive.load(Ordering::Acquire) {
        config::authorize(root, client_id, token)?;
        match stream.read(&mut [0]) {
            Ok(0) => return Ok(()),
            Ok(_) => return Err(BrowserError::InvalidRequest),
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) => {}
            Err(_) => return Err(BrowserError::Transport),
        }
    }
    Ok(())
}
