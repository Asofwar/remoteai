use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use reqwest::{Proxy, Url};

use super::{parsing::parse_windows_proxy, resolve_async};

const DEADLINE: Duration = Duration::from_secs(5);
const TARGET: &str = "http://destination.invalid:8080/v1/responses?test=1";
const IP_TARGET: &str = "http://198.51.100.1:8080/v1/responses?test=1";

fn target_for(scheme: &str) -> &'static str {
    if scheme == "socks4" {
        IP_TARGET
    } else {
        TARGET
    }
}

fn fixture(scheme: &'static str) -> (Url, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let proxy = Url::parse(&format!("{scheme}://{}", listener.local_addr().unwrap())).unwrap();
    let worker = thread::spawn(move || {
        let mut stream = accept(&listener);
        // Windows inherits the listener's nonblocking mode on accepted sockets.
        stream.set_nonblocking(false).unwrap();
        stream.set_read_timeout(Some(DEADLINE)).unwrap();
        stream.set_write_timeout(Some(DEADLINE)).unwrap();
        match scheme {
            "socks5h" => socks5_handshake(&mut stream),
            "socks4" | "socks4a" => socks4_handshake(&mut stream, scheme == "socks4a"),
            "http" => {}
            _ => panic!("unsupported fixture protocol"),
        }
        let mut headers = Vec::new();
        while !headers.ends_with(b"\r\n\r\n") {
            assert!(headers.len() < 8192);
            headers.push(read_byte(&mut stream));
        }
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
            .unwrap();
        String::from_utf8(headers).unwrap()
    });
    (proxy, worker)
}

fn accept(listener: &TcpListener) -> TcpStream {
    let deadline = Instant::now() + DEADLINE;
    loop {
        match listener.accept() {
            Ok((stream, _)) => return stream,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                assert!(Instant::now() < deadline, "proxy was never contacted");
                thread::sleep(Duration::from_millis(5));
            }
            Err(error) => panic!("proxy accept failed: {error}"),
        }
    }
}

fn read_byte(stream: &mut TcpStream) -> u8 {
    let mut byte = [0];
    stream.read_exact(&mut byte).unwrap();
    byte[0]
}

fn read_string(stream: &mut TcpStream) -> Vec<u8> {
    let mut bytes = Vec::new();
    loop {
        let byte = read_byte(stream);
        if byte == 0 {
            return bytes;
        }
        assert!(bytes.len() < 256);
        bytes.push(byte);
    }
}

fn socks5_handshake(stream: &mut TcpStream) {
    assert_eq!(read_byte(stream), 5);
    let mut methods = vec![0; read_byte(stream) as usize];
    stream.read_exact(&mut methods).unwrap();
    assert!(methods.contains(&0));
    stream.write_all(&[5, 0]).unwrap();
    let mut request = [0; 4];
    stream.read_exact(&mut request).unwrap();
    assert_eq!(
        request,
        [5, 1, 0, 3],
        "SOCKS5 must resolve the destination remotely"
    );
    let mut host = vec![0; read_byte(stream) as usize];
    stream.read_exact(&mut host).unwrap();
    assert_eq!(host, b"destination.invalid");
    let mut port = [0; 2];
    stream.read_exact(&mut port).unwrap();
    assert_eq!(u16::from_be_bytes(port), 8080);
    stream
        .write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 80])
        .unwrap();
}

fn socks4_handshake(stream: &mut TcpStream, remote_dns: bool) {
    let mut request = [0; 8];
    stream.read_exact(&mut request).unwrap();
    assert_eq!(&request[..4], &[4, 1, 0x1f, 0x90]);
    assert!(read_string(stream).is_empty());
    if remote_dns {
        assert_eq!(&request[4..7], &[0, 0, 0]);
        assert_ne!(
            request[7], 0,
            "SOCKS4a uses a nonzero final octet for remote DNS"
        );
        assert_eq!(read_string(stream), b"destination.invalid");
    } else {
        assert_eq!(&request[4..], &[198, 51, 100, 1]);
    }
    stream.write_all(&[0, 90, 0, 80, 127, 0, 0, 1]).unwrap();
}

#[tokio::test]
async fn async_requests_reach_http_and_socks_proxies_without_local_dns() {
    for scheme in ["http", "socks4", "socks4a", "socks5h"] {
        let (proxy, worker) = fixture(scheme);
        let config = parse_windows_proxy(proxy.as_str(), None).unwrap();
        let target = Url::parse(target_for(scheme)).unwrap();
        let builder = resolve_async(reqwest::Client::builder(), target.clone(), move |url| {
            assert_eq!(
                url.as_str(),
                target_for(scheme),
                "PAC lookup must retain the complete URL"
            );
            config.configured_proxy_for(url)
        })
        .await
        .unwrap();
        let response = builder
            .timeout(DEADLINE)
            .build()
            .unwrap()
            .get(target)
            .send()
            .await
            .unwrap();
        assert_eq!(response.text().await.unwrap(), "ok");
        assert!(worker.join().unwrap().contains("/v1/responses?test=1"));
    }
}

#[test]
fn blocking_requests_reach_socks_proxies_without_local_dns() {
    for scheme in ["socks4", "socks4a", "socks5h"] {
        let (proxy, worker) = fixture(scheme);
        let config = parse_windows_proxy(proxy.as_str(), None).unwrap();
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .proxy(Proxy::custom(move |target| {
                config.configured_proxy_for(target)
            }))
            .timeout(DEADLINE)
            .build()
            .unwrap();
        assert_eq!(
            client
                .get(target_for(scheme))
                .send()
                .unwrap()
                .text()
                .unwrap(),
            "ok"
        );
        assert!(worker
            .join()
            .unwrap()
            .starts_with("GET /v1/responses?test=1 HTTP/1.1"));
    }
}

#[tokio::test(flavor = "current_thread")]
async fn slow_proxy_discovery_keeps_async_polling_responsive() {
    let (finish, pending) = mpsc::channel();
    let task = tokio::spawn(resolve_async(
        reqwest::Client::builder(),
        Url::parse(TARGET).unwrap(),
        move |_| {
            pending.recv_timeout(DEADLINE).unwrap();
            None
        },
    ));
    // A current-thread runtime catches accidental blocking in the lookup callback.
    for _ in 0..3 {
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!task.is_finished());
    }
    finish.send(()).unwrap();
    drop(task.await.unwrap().unwrap());
}
