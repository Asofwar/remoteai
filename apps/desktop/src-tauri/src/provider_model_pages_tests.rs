use super::*;
use serde_json::json;
use std::time::Duration;
use tiny_http::{Header, Response as HttpResponse, Server};

fn endpoint(server: &Server) -> String {
    format!(
        "http://{}/v1beta?tenant=east&key=query-secret",
        server.server_addr()
    )
}

#[test]
fn gemini_discovery_pages_preserve_query_headers_and_filter_empty_pages() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let base = endpoint(&server);
    let worker = std::thread::spawn(move || {
        for page in 0..2 {
            let request = server
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap();
            let url = Url::parse(&format!("http://local{}", request.url())).unwrap();
            assert_eq!(url.path(), "/v1beta/models");
            let query = url
                .query_pairs()
                .collect::<std::collections::HashMap<_, _>>();
            assert_eq!(
                query.get("tenant").map(|value| value.as_ref()),
                Some("east")
            );
            assert_eq!(
                query.get("key").map(|value| value.as_ref()),
                Some("query-secret")
            );
            assert_eq!(
                query.get("pageToken").map(|value| value.as_ref()),
                (page == 1).then_some("next+/=&")
            );
            assert!(request
                .headers()
                .iter()
                .any(|header| header.field.equiv("x-goog-api-key")
                    && header.value.as_str() == "secret"));
            let body = if page == 0 {
                json!({"models":[{"name":"models/embedding", "supportedGenerationMethods":["embedContent"]}], "nextPageToken":"next+/=&"})
            } else {
                json!({"models":[{"name":"models/chat"},{"name":"models/chat"}]})
            };
            request
                .respond(HttpResponse::from_string(body.to_string()))
                .unwrap();
        }
    });
    let models = super::super::fetch_models(
        &base,
        "secret",
        ProviderApiFormat::GeminiGenerateContent,
        None,
    )
    .unwrap();
    assert_eq!(models, ["chat"]);
    worker.join().unwrap();
}

#[test]
fn anthropic_pagination_replaces_only_cursor_and_keeps_custom_headers() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let base = format!("{}&after_id=start", endpoint(&server));
    let worker = std::thread::spawn(move || {
        for page in 0..2 {
            let request = server
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap();
            let url = Url::parse(&format!("http://local{}", request.url())).unwrap();
            let cursors = url
                .query_pairs()
                .filter(|(key, _)| key == "after_id")
                .map(|(_, v)| v.into_owned())
                .collect::<Vec<_>>();
            assert_eq!(
                cursors,
                [if page == 0 {
                    "start"
                } else {
                    "https://other.invalid/?token=x"
                }]
            );
            for (name, value) in [("x-api-key", "secret"), ("x-region", "west")] {
                assert!(request
                    .headers()
                    .iter()
                    .any(|header| header.field.equiv(name) && header.value.as_str() == value));
            }
            let body = json!({"data":[{"id":format!("claude-{page}")}], "has_more":page == 0,
                "last_id":"https://other.invalid/?token=x"});
            request
                .respond(HttpResponse::from_string(body.to_string()))
                .unwrap();
        }
    });
    let options = ProviderRequestOptions {
        headers: [("x-region".into(), "west".into())].into(),
        ..Default::default()
    };
    let models = super::super::fetch_models(
        &base,
        "secret",
        ProviderApiFormat::AnthropicMessages,
        Some(&options),
    )
    .unwrap();
    assert_eq!(models, ["claude-0", "claude-1"]);
    worker.join().unwrap();
}

#[test]
fn discovery_does_not_forward_credentials_or_query_tokens_through_redirects() {
    let first = Server::http("127.0.0.1:0").unwrap();
    let other = Server::http("127.0.0.1:0").unwrap();
    let base = endpoint(&first);
    let redirect = format!("http://{}/collect", other.server_addr());
    let worker = std::thread::spawn(move || {
        let request = first.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
        request
            .respond(
                HttpResponse::empty(302)
                    .with_header(Header::from_bytes("Location", redirect).unwrap()),
            )
            .unwrap();
    });
    assert!(super::super::fetch_models(
        &base,
        "secret",
        ProviderApiFormat::GeminiGenerateContent,
        None
    )
    .is_err());
    worker.join().unwrap();
    assert!(other
        .recv_timeout(Duration::from_millis(100))
        .unwrap()
        .is_none());
}

#[test]
fn repeated_cursors_and_excessive_pages_fail_instead_of_returning_partial_catalogs() {
    for repeated in [true, false] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let base = endpoint(&server);
        let pages = if repeated { 2 } else { MAX_PAGES };
        let worker = std::thread::spawn(move || {
            for page in 0..pages {
                let request = server
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap()
                    .unwrap();
                let body = json!({"models":[{"name":"models/chat"}],
                    "nextPageToken":if repeated { "same".into() } else { format!("next-{page}") }});
                request
                    .respond(HttpResponse::from_string(body.to_string()))
                    .unwrap();
            }
        });
        let error = super::super::fetch_models(
            &base,
            "secret",
            ProviderApiFormat::GeminiGenerateContent,
            None,
        )
        .unwrap_err();
        assert!(error.contains(if repeated { "repeated" } else { "too many" }));
        worker.join().unwrap();
    }
}

#[test]
fn invalid_native_pagination_cursors_are_rejected() {
    for payload in [
        json!({"has_more":true}),
        json!({"has_more":true,"last_id":null}),
        json!({"has_more":true,"last_id":""}),
        json!({"has_more":"true"}),
    ] {
        assert!(next_cursor(&payload, ProviderApiFormat::AnthropicMessages).is_err());
    }
    assert!(next_cursor(
        &json!({"nextPageToken":42}),
        ProviderApiFormat::GeminiGenerateContent
    )
    .is_err());
}
