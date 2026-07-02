mod capture;
mod input;

use std::sync::LazyLock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

static CAPTURE_RUNNING: LazyLock<Arc<AtomicBool>> = LazyLock::new(|| Arc::new(AtomicBool::new(false)));

#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0")
        .map_err(|e| e.to_string())?;
    // Connecting to a public IP causes the OS to select the correct local network interface IP.
    socket.connect("8.8.8.8:80")
        .map_err(|e| e.to_string())?;
    Ok(socket.local_addr().map_err(|e| e.to_string())?.ip().to_string())
}

#[tauri::command]
async fn start_host(app: tauri::AppHandle) -> Result<(), String> {
    capture::start_capture()?;
    
    let running = CAPTURE_RUNNING.clone();
    running.store(true, Ordering::Relaxed);
    
    tauri::async_runtime::spawn(async move {
        use base64::{Engine as _, engine::general_purpose};
        while running.load(Ordering::Relaxed) {
            if let Some(frame) = capture::get_latest_frame() {
                let b64 = general_purpose::STANDARD.encode(&frame);
                let _ = app.emit("local-frame", b64);
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(33)).await; // ~30 fps
        }
        capture::stop_capture();
    });
    Ok(())
}

#[tauri::command]
fn stop_host() {
    CAPTURE_RUNNING.store(false, Ordering::Relaxed);
    capture::stop_capture();
}

#[tauri::command]
fn send_mouse_move(x: f64, y: f64) {
    input::move_mouse(x, y);
}

#[tauri::command]
fn send_mouse_click(button: u8, down: bool, x: f64, y: f64) {
    input::click_mouse(button, down, x, y);
}

#[tauri::command]
fn send_key_event(keycode: u16, down: bool) {
    input::key_event(keycode, down);
}

#[tauri::command]
fn read_clipboard() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("pbpaste")
            .output()
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args(&["-Command", "Get-Clipboard"])
            .output()
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

#[tauri::command]
fn write_clipboard(text: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        let mut child = std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        child.wait().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        let mut child = std::process::Command::new("powershell")
            .args(&["-Command", "Set-Clipboard"])
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        child.wait().map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn get_displays() -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        use screencapturekit::prelude::SCShareableContent;
        let content = SCShareableContent::get().map_err(|e| e.to_string())?;
        let displays = content.displays();
        let mut list = Vec::new();
        for (idx, display) in displays.iter().enumerate() {
            list.push(format!("Display {} ({}x{})", idx + 1, display.width(), display.height()));
        }
        Ok(list)
    }
    #[cfg(target_os = "windows")]
    {
        Ok(vec!["Display 1 (Primary)".to_string()])
    }
}

#[tauri::command]
fn set_active_display(index: usize) {
    capture::set_display_index(index);
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_local_ip,
            start_host,
            stop_host,
            send_mouse_move,
            send_mouse_click,
            send_key_event,
            read_clipboard,
            write_clipboard,
            get_displays,
            set_active_display
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
