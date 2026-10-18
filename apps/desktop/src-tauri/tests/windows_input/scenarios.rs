use super::fixture::FocusReentry;
use tao::{
    event::{ElementState, Event, KeyEvent, StartCause, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    keyboard::KeyCode,
    platform::{
        run_return::EventLoopExtRunReturn,
        windows::{EventLoopBuilderExtWindows, WindowExtWindows},
    },
    window::WindowBuilder,
};
use windows::Win32::{
    Foundation::{HWND, LPARAM, WPARAM},
    UI::{
        Input::KeyboardAndMouse::{VK_A, VK_SHIFT},
        WindowsAndMessaging::{
            DispatchMessageW, PeekMessageW, PostMessageW, SendMessageW, MSG, PM_REMOVE, WM_CHAR,
            WM_IME_ENDCOMPOSITION, WM_KEYDOWN, WM_KEYFIRST, WM_KEYLAST, WM_KEYUP, WM_SYSCHAR,
            WM_SYSKEYDOWN, WM_SYSKEYUP,
        },
    },
};

const SHIFT_SCANCODE: isize = 0x2a;
const A_SCANCODE: isize = 0x1e;
const RELEASE_BITS: isize = 0xc000_0000_u32 as isize;
const KEY_REPEAT: isize = 1;

pub fn run(case: &str) {
    let mut event_loop = EventLoopBuilder::<()>::new().with_any_thread(true).build();
    let window = WindowBuilder::new()
        .with_visible(false)
        .with_focused(false)
        .with_title("RemoteAI input regression fixture")
        .build(&event_loop)
        .unwrap();
    let hwnd = HWND(window.hwnd() as _);
    let mut keys = Vec::new();
    let mut ime = Vec::new();
    event_loop.run_return(|event, _, flow| {
        *flow = ControlFlow::Poll;
        match event {
            Event::NewEvents(StartCause::Init) => exercise(hwnd, case),
            Event::WindowEvent {
                event:
                    WindowEvent::KeyboardInput {
                        event,
                        is_synthetic: false,
                        ..
                    },
                ..
            } => {
                keys.push(event);
            }
            Event::WindowEvent {
                event: WindowEvent::ReceivedImeText(text),
                ..
            } => ime.push(text),
            Event::MainEventsCleared => *flow = ControlFlow::Exit,
            _ => {}
        }
    });
    verify_events(case, &keys, &ime);
}

fn verify_events(case: &str, keys: &[KeyEvent], ime: &[String]) {
    if case == "text" {
        let typed: Vec<_> = keys.iter().filter_map(|key| key.text).collect();
        assert_eq!(typed, ["a", "\u{1f600}"]);
        assert!(
            ime.iter().any(|text| text == "\u{4e2d}\u{1f600}"),
            "IME text: {ime:?}"
        );
        assert_eq!(
            keys.iter().map(|key| key.state).collect::<Vec<_>>(),
            [
                ElementState::Pressed,
                ElementState::Released,
                ElementState::Pressed,
                ElementState::Released,
            ]
        );
    } else if matches!(case, "keyup" | "syskeyup" | "keydown" | "syskeydown") {
        let expected = if case.ends_with("keyup") {
            ElementState::Released
        } else {
            ElementState::Pressed
        };
        assert!(keys
            .iter()
            .any(|key| key.physical_key == KeyCode::ShiftLeft && key.state == expected));
    } else if case != "ime" {
        assert!(keys.iter().any(|key| key.text == Some("a")));
    } else {
        assert!(ime.iter().any(|text| text == "ab"), "IME text: {ime:?}");
    }
}

fn exercise(hwnd: HWND, case: &str) {
    if case == "text" {
        type_text(hwnd, "a");
        type_text(hwnd, "\u{1f600}");
        send(hwnd, WM_IME_ENDCOMPOSITION, 0, 0);
        post_text(hwnd, WM_CHAR, "\u{4e2d}\u{1f600}");
        drain_keys(hwnd);
        return;
    }
    let message = match case {
        "keyup" => WM_KEYUP,
        "syskeyup" => WM_SYSKEYUP,
        "keydown" => WM_KEYDOWN,
        "syskeydown" => WM_SYSKEYDOWN,
        "char" | "ime" => WM_CHAR,
        "syschar" => WM_SYSCHAR,
        _ => panic!("unknown scenario: {case}"),
    };
    let character = matches!(message, WM_CHAR | WM_SYSCHAR);
    if character {
        prepare_character(hwnd, message, case == "ime");
    }
    let mut fixture = FocusReentry::install(hwnd, message, case == "ime");
    let (key, scan) = if character {
        ('a' as usize, A_SCANCODE)
    } else {
        (VK_SHIFT.0 as usize, SHIFT_SCANCODE)
    };
    let release = if case.ends_with("keyup") {
        RELEASE_BITS
    } else {
        0
    };
    send(hwnd, message, key, (scan << 16) | KEY_REPEAT | release);
    fixture.verify();
    drop(fixture);
    drain_keys(hwnd);
}

fn prepare_character(hwnd: HWND, message: u32, ime: bool) {
    post_text(hwnd, message, "a");
    send(
        hwnd,
        WM_KEYDOWN,
        VK_A.0 as usize,
        (A_SCANCODE << 16) | KEY_REPEAT,
    );
    if ime {
        send(hwnd, WM_IME_ENDCOMPOSITION, 0, 0);
    }
    let mut queued = MSG::default();
    // SAFETY: The live window and writable MSG belong to this thread.
    assert!(
        unsafe { PeekMessageW(&mut queued, Some(hwnd), WM_KEYFIRST, WM_KEYLAST, PM_REMOVE) }
            .as_bool()
    );
    if ime {
        post_text(hwnd, message, "b");
    }
}

fn type_text(hwnd: HWND, text: &str) {
    post_text(hwnd, WM_CHAR, text);
    send(
        hwnd,
        WM_KEYDOWN,
        VK_A.0 as usize,
        (A_SCANCODE << 16) | KEY_REPEAT,
    );
    drain_keys(hwnd);
    send(
        hwnd,
        WM_KEYUP,
        VK_A.0 as usize,
        (A_SCANCODE << 16) | KEY_REPEAT | RELEASE_BITS,
    );
}

fn post_text(hwnd: HWND, message: u32, text: &str) {
    for code_unit in text.encode_utf16() {
        // SAFETY: The fixture window is live, and character messages contain no pointers.
        unsafe {
            PostMessageW(
                Some(hwnd),
                message,
                WPARAM(code_unit as usize),
                LPARAM(KEY_REPEAT),
            )
        }
        .unwrap();
    }
}

fn send(hwnd: HWND, message: u32, key: usize, flags: isize) {
    // SAFETY: The fixture window is live on this thread; input parameters contain no pointers.
    unsafe {
        SendMessageW(hwnd, message, Some(WPARAM(key)), Some(LPARAM(flags)));
    }
}

fn drain_keys(hwnd: HWND) {
    let mut message = MSG::default();
    // SAFETY: MSG storage is valid and only messages for the live fixture window are dispatched.
    unsafe {
        while PeekMessageW(&mut message, Some(hwnd), WM_KEYFIRST, WM_KEYLAST, PM_REMOVE).as_bool() {
            DispatchMessageW(&message);
        }
    }
}
