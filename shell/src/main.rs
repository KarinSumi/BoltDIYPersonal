use tao::{
    event::{Event, StartCause, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::{WindowBuilder, Window},
};
use wry::WebViewBuilder;
use tray_icon::{TrayIconBuilder, menu::{Menu, MenuItem}};

fn main() -> wry::Result<()> {
    let event_loop = EventLoop::new();

    let window = WindowBuilder::new()
        .with_title("OpenCode OS")
        .with_transparent(true)
        .with_decorations(false)
        .build(&event_loop)
        .expect("Failed to create window");

    // Apply Windows-specific transparency
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_EX_TOOLWINDOW,
        };
        use windows_sys::Win32::Foundation::HWND;
        use std::mem;
        let hwnd: HWND = std::mem::transmute(window.hwnd() as isize);
        unsafe {
            let ex_style = SetWindowLongW(hwnd, GWL_EXSTYLE, 0);
            SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW as i32);
        }
    }

    let _webview = WebViewBuilder::new(&window)
        .with_url("http://127.0.0.1:8787/")
        .build()?;

    let tray_menu = Menu::new();
    let quit_item = MenuItem::new("Quit", true, None);
    tray_menu.append(&quit_item).expect("append quit");

    let _tray = TrayIconBuilder::new()
        .with_tooltip("OpenCode OS")
        .with_menu(&tray_menu)
        .build()
        .expect("build tray");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::NewEvents(StartCause::Init) => {
                // Spawn the daemon server as a child process
                let _ = std::process::Command::new("node")
                    .args(&["daemon/server.js"])
                    .spawn();
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            _ => {}
        }
    });
}
