#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod input;

use std::sync::LazyLock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

// Added for native background signaling server
use std::collections::HashMap;
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{StreamExt, SinkExt};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

static CAPTURE_RUNNING: LazyLock<Arc<AtomicBool>> = LazyLock::new(|| Arc::new(AtomicBool::new(false)));
static CAPTURE_SLEEP_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(33);
static KEYBOARD_HOOK_ACTIVE: AtomicBool = AtomicBool::new(false);
static KEYBOARD_HOOK_SENDER: LazyLock<std::sync::Mutex<Option<std::sync::mpsc::Sender<rdev::Event>>>> = LazyLock::new(|| std::sync::Mutex::new(None));

static CURRENT_HOST_CODE: LazyLock<std::sync::Mutex<Option<String>>> = LazyLock::new(|| std::sync::Mutex::new(None));
static HTTP_SHUTDOWN_TX: LazyLock<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = LazyLock::new(|| std::sync::Mutex::new(None));
static DIRECT_PAIR_RESPONSE_TX: LazyLock<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<String>>>> = LazyLock::new(|| std::sync::Mutex::new(None));

// ----------------------------------------------------
// NATIVE SIGNALING SERVER (PORT 8080)
// ----------------------------------------------------
type Tx = mpsc::UnboundedSender<Message>;
type PeerMap = Arc<tokio::sync::Mutex<HashMap<String, Tx>>>;

async fn start_signaling_server() {
    let addr = "0.0.0.0:8080".to_string();
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind signaling server: {}", e);
            return;
        }
    };
    println!("Native Signaling Server listening on: {}", addr);

    let peers: PeerMap = Arc::new(tokio::sync::Mutex::new(HashMap::new()));

    while let Ok((stream, _)) = listener.accept().await {
        let peers = peers.clone();
        tokio::spawn(async move {
            let ws_stream = match accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    eprintln!("Error during WebSocket handshake: {}", e);
                    return;
                }
            };

            let (mut ws_sender, mut ws_receiver) = ws_stream.split();
            let (tx, mut rx) = mpsc::unbounded_channel();

            tokio::spawn(async move {
                while let Some(message) = rx.recv().await {
                    if ws_sender.send(message).await.is_err() {
                        break;
                    }
                }
            });

            let mut client_id: Option<String> = None;

            while let Some(msg) = ws_receiver.next().await {
                let msg = match msg {
                    Ok(m) => m,
                    Err(_) => break,
                };

                if msg.is_text() {
                    let text = msg.to_text().unwrap_or("");
                    if let Ok(val) = serde_json::from_str::<Value>(text) {
                        if let Some(msg_type) = val.get("type").and_then(|t| t.as_str()) {
                            match msg_type {
                                "register" => {
                                    if let Some(id) = val.get("id").and_then(|i| i.as_str()) {
                                        let id_str = id.to_string();
                                        client_id = Some(id_str.clone());
                                        peers.lock().await.insert(id_str.clone(), tx.clone());
                                        
                                        let response = serde_json::json!({
                                            "type": "registered",
                                            "id": id_str
                                        });
                                        let _ = tx.send(Message::Text(response.to_string().into()));
                                    }
                                }
                                "signal" => {
                                    if let Some(target) = val.get("target").and_then(|t| t.as_str()) {
                                        let target_str = target.to_string();
                                        let data = val.get("data").cloned().unwrap_or(Value::Null);
                                        
                                        let peers_guard = peers.lock().await;
                                        if let Some(target_tx) = peers_guard.get(&target_str) {
                                            let forward = serde_json::json!({
                                                "type": "signal",
                                                "sender": client_id.clone().unwrap_or_default(),
                                                "data": data
                                            });
                                            let _ = target_tx.send(Message::Text(forward.to_string().into()));
                                        } else {
                                            let err_response = serde_json::json!({
                                                "type": "error",
                                                "message": format!("Device {} is offline or not found", target_str)
                                            });
                                            let _ = tx.send(Message::Text(err_response.to_string().into()));
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }

            if let Some(id) = client_id {
                peers.lock().await.remove(&id);
            }
        });
    }
}

async fn handle_direct_http_connection(mut stream: tokio::net::TcpStream, app: tauri::AppHandle) {
    let mut buffer = [0; 8192];
    let mut bytes_read = 0;
    
    // Read request bytes
    while bytes_read < buffer.len() {
        match stream.read(&mut buffer[bytes_read..]).await {
            Ok(0) => break,
            Ok(n) => {
                bytes_read += n;
                // Simple check for end of HTTP headers
                if buffer[..bytes_read].windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            Err(_) => return,
        }
    }
    
    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]);
    
    // Simple HTTP parser
    if request_str.starts_with("OPTIONS /pair") {
        let response = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: 0\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }
    
    if !request_str.starts_with("POST /pair") {
        let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }
    
    // Extract JSON body
    let parts: Vec<&str> = request_str.split("\r\n\r\n").collect();
    if parts.len() < 2 {
        let response = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }
    
    let body = parts[1];
    let val: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => {
            let response = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
    };
    
    let client_code = val.get("code").and_then(|c| c.as_str()).unwrap_or("");
    let client_id = val.get("clientId").and_then(|c| c.as_str()).unwrap_or("");
    let client_sdp = val.get("sdp").cloned().unwrap_or(serde_json::Value::Null);
    
    // Get host code from memory
    let host_code = match CURRENT_HOST_CODE.lock() {
        Ok(lock) => lock.clone().unwrap_or_default(),
        Err(_) => String::new(),
    };
    
    if client_code.is_empty() || client_code != host_code {
        let response = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }
    
    // Code matches! Emit a Tauri event to the host WebView to trigger the security dialog
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    if let Ok(mut lock) = DIRECT_PAIR_RESPONSE_TX.lock() {
        *lock = Some(tx);
    }
    
    let event_payload = serde_json::json!({
        "clientId": client_id,
        "sdp": client_sdp
    });
    
    if let Err(_) = app.emit("direct-pairing-request", &event_payload) {
        let response = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }
    
    // Wait for the host JS to accept or decline the request
    tokio::select! {
        res_ok = rx => {
            match res_ok {
                Ok(host_answer) => {
                    let body_response = serde_json::json!({
                        "sdp": host_answer
                    }).to_string();
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: {}\r\n\r\n{}",
                        body_response.len(),
                        body_response
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                }
                Err(_) => {
                    let response = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n";
                    let _ = stream.write_all(response.as_bytes()).await;
                }
            }
        }
        _ = tokio::time::sleep(tokio::time::Duration::from_secs(30)) => {
            let response = "HTTP/1.1 408 Request Timeout\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(response.as_bytes()).await;
        }
    }
}

// ----------------------------------------------------
// AUTO-UPDATER STRUCTURES & LOGIC
// ----------------------------------------------------
fn is_newer(latest: &str, current: &str) -> bool {
    let latest_parts: Vec<&str> = latest.split('.').collect();
    let current_parts: Vec<&str> = current.split('.').collect();
    for i in 0..std::cmp::min(latest_parts.len(), current_parts.len()) {
        let l = latest_parts[i].parse::<i32>().unwrap_or(0);
        let c = current_parts[i].parse::<i32>().unwrap_or(0);
        if l > c { return true; }
        if l < c { return false; }
    }
    latest_parts.len() > current_parts.len()
}

#[derive(serde::Deserialize, Clone)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(serde::Deserialize, Clone)]
struct GithubRelease {
    tag_name: String,
    body: String,
    assets: Vec<GithubAsset>,
}

#[tauri::command]
async fn check_for_update() -> Result<serde_json::Value, String> {
    let current_version = env!("CARGO_PKG_VERSION");
    let url = "https://api.github.com/repos/Hootsworth/LinkUp/releases/latest";
    
    let mut response = ureq::get(url)
        .header("User-Agent", "linkup-app")
        .call()
        .map_err(|e| e.to_string())?;

    let reader = response.body_mut().as_reader();
    let release_info: GithubRelease = serde_json::from_reader(reader)
        .map_err(|e| e.to_string())?;

    let latest_version = release_info.tag_name.strip_prefix('v').unwrap_or(&release_info.tag_name);

    if is_newer(latest_version, current_version) {
        let mut download_url = None;
        let mut asset_name = None;
        
        #[cfg(target_os = "macos")]
        {
            let target_arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x64" };
            for asset in &release_info.assets {
                if asset.name.ends_with(".dmg") && asset.name.contains(target_arch) {
                    download_url = Some(asset.browser_download_url.clone());
                    asset_name = Some(asset.name.clone());
                    break;
                }
            }
            if download_url.is_none() {
                for asset in &release_info.assets {
                    if asset.name.ends_with(".dmg") {
                        download_url = Some(asset.browser_download_url.clone());
                        asset_name = Some(asset.name.clone());
                        break;
                    }
                }
            }
        }
        
        #[cfg(target_os = "windows")]
        {
            for asset in &release_info.assets {
                if asset.name.ends_with(".exe") {
                    download_url = Some(asset.browser_download_url.clone());
                    asset_name = Some(asset.name.clone());
                    break;
                }
            }
        }
        
        #[cfg(target_os = "linux")]
        {
            for asset in &release_info.assets {
                if asset.name.ends_with(".deb") {
                    download_url = Some(asset.browser_download_url.clone());
                    asset_name = Some(asset.name.clone());
                    break;
                }
            }
        }

        if let Some(url) = download_url {
            return Ok(serde_json::json!({
                "update_available": true,
                "latest_version": release_info.tag_name,
                "current_version": format!("v{}", current_version),
                "notes": release_info.body,
                "download_url": url,
                "asset_name": asset_name.unwrap_or_default()
            }));
        }
    }

    Ok(serde_json::json!({
        "update_available": false
    }))
}

#[tauri::command]
async fn apply_update(download_url: String, asset_name: String) -> Result<(), String> {
    let mut response = ureq::get(&download_url)
        .header("User-Agent", "linkup-app")
        .call()
        .map_err(|e| e.to_string())?;

    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join(&asset_name);
    
    let mut file = std::fs::File::create(&temp_file_path)
        .map_err(|e| e.to_string())?;
        
    let mut reader = response.body_mut().as_reader();
    std::io::copy(&mut reader, &mut file)
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&temp_file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        // Use cmd /C start to launch the installer fully detached so Windows
        // does not complain about the file being in use by this process.
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", temp_file_path.to_str().unwrap_or("")])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| e.to_string())?;
        std::process::exit(0);
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&temp_file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ----------------------------------------------------
// EXISTING CORE TAURI COMMANDS
// ----------------------------------------------------
#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0")
        .map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80")
        .map_err(|e| e.to_string())?;
    Ok(socket.local_addr().map_err(|e| e.to_string())?.ip().to_string())
}

#[tauri::command]
async fn start_host(app: tauri::AppHandle, code: String) -> Result<(), String> {
    let capture_init = capture::start_capture();
    if let Err(ref e) = capture_init {
        println!("[RUST WARN] Screen capture initialization skipped/failed: {}", e);
    }
    
    // Store current host session pairing code
    if let Ok(mut lock) = CURRENT_HOST_CODE.lock() {
        *lock = Some(code.clone());
    }
    
    let running = CAPTURE_RUNNING.clone();
    running.store(true, Ordering::Relaxed);
    
    let running_capture = running.clone();
    let app_capture = app.clone();
    let has_capture = capture_init.is_ok();
    tauri::async_runtime::spawn(async move {
        if !has_capture {
            return;
        }
        while running_capture.load(Ordering::Relaxed) {
            if let Some(frame) = capture::get_latest_frame() {
                match app_capture.emit("local-frame", &frame) {
                    Ok(_) => println!("[RUST DEBUG] app.emit local-frame succeeded (len: {})", frame.len()),
                    Err(e) => println!("[RUST ERROR] app.emit local-frame failed: {:?}", e),
                }
            }
            let sleep_ms = CAPTURE_SLEEP_MS.load(Ordering::Relaxed);
            tokio::time::sleep(tokio::time::Duration::from_millis(sleep_ms)).await;
        }
        capture::stop_capture();
    });

    let running_clipboard = running.clone();
    let app_clip = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut last_clipboard = match read_clipboard() {
            Ok(text) => text,
            Err(_) => String::new(),
        };
        
        while running_clipboard.load(Ordering::Relaxed) {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if let Ok(current_text) = read_clipboard() {
                if !current_text.is_empty() && current_text != last_clipboard {
                    last_clipboard = current_text.clone();
                    if let Err(e) = app_clip.emit("host-clipboard-changed", &last_clipboard) {
                        println!("[RUST ERROR] failed to emit host-clipboard-changed: {:?}", e);
                    }
                }
            }
        }
    });

    // Spawn direct local HTTP server for single-round-trip LDSH pairing
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    if let Ok(mut lock) = HTTP_SHUTDOWN_TX.lock() {
        *lock = Some(tx);
    }
    
    let app_http = app.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind("0.0.0.0:8081").await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("Failed to bind direct HTTP server: {}", e);
                return;
            }
        };
        println!("Direct HTTP Signaling Server listening on: 0.0.0.0:8081");
        
        let mut shutdown_signal = rx;
        loop {
            tokio::select! {
                accept_res = listener.accept() => {
                    if let Ok((stream, _)) = accept_res {
                        let app_clone = app_http.clone();
                        tokio::spawn(async move {
                            handle_direct_http_connection(stream, app_clone).await;
                        });
                    }
                }
                _ = &mut shutdown_signal => {
                    println!("Direct HTTP server shutting down");
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_host() {
    CAPTURE_RUNNING.store(false, Ordering::Relaxed);
    capture::stop_capture();
    
    // Clear pairing code
    if let Ok(mut lock) = CURRENT_HOST_CODE.lock() {
        *lock = None;
    }
    
    // Shut down direct HTTP signaling server
    if let Ok(mut lock) = HTTP_SHUTDOWN_TX.lock() {
        if let Some(tx) = lock.take() {
            let _ = tx.send(());
        }
    }
}

#[tauri::command]
fn submit_direct_pairing_answer(answer: String) {
    if let Ok(mut lock) = DIRECT_PAIR_RESPONSE_TX.lock() {
        if let Some(tx) = lock.take() {
            let _ = tx.send(answer);
        }
    }
}

#[tauri::command]
fn submit_direct_pairing_decline() {
    if let Ok(mut lock) = DIRECT_PAIR_RESPONSE_TX.lock() {
        let _ = lock.take(); // drops sender which signals HTTP 403 back to client
    }
}

#[tauri::command]
fn set_keyboard_hook_active(active: bool) {
    KEYBOARD_HOOK_ACTIVE.store(active, Ordering::Relaxed);
    println!("[RUST] Keyboard hook active status set to: {}", active);
}

fn spawn_keyboard_hook(app: tauri::AppHandle) {
    let (tx, rx) = std::sync::mpsc::channel::<rdev::Event>();
    if let Ok(mut lock) = KEYBOARD_HOOK_SENDER.lock() {
        *lock = Some(tx);
    }

    // Decoupled worker thread to process and emit keyboard events to webview.
    // This keeps AppKit/CGEventTap thread callbacks extremely fast, preventing macOS OS-level event tap timeouts and crashes.
    let worker_app = app.clone();
    std::thread::spawn(move || {
        while let Ok(event) = rx.recv() {
            if KEYBOARD_HOOK_ACTIVE.load(Ordering::Relaxed) {
                match event.event_type {
                    rdev::EventType::KeyPress(key) => {
                        let keycode = rdev_key_to_keycode(key);
                        if keycode > 0 {
                            let _ = worker_app.emit("native-key-event", serde_json::json!({
                                "keycode": keycode,
                                "down": true
                            }));
                        }
                    }
                    rdev::EventType::KeyRelease(key) => {
                        let keycode = rdev_key_to_keycode(key);
                        if keycode > 0 {
                            let _ = worker_app.emit("native-key-event", serde_json::json!({
                                "keycode": keycode,
                                "down": false
                            }));
                        }
                    }
                    _ => {}
                }
            }
        }
    });

    std::thread::spawn(move || {
        if let Err(error) = rdev::listen(move |event| {
            if KEYBOARD_HOOK_ACTIVE.load(Ordering::Relaxed) {
                if let Ok(lock) = KEYBOARD_HOOK_SENDER.lock() {
                    if let Some(tx) = lock.as_ref() {
                        let _ = tx.send(event);
                    }
                }
            }
        }) {
            eprintln!("Failed to start global keyboard hook listener: {:?}", error);
        }
    });
}

fn rdev_key_to_keycode(key: rdev::Key) -> u16 {
    match key {
        rdev::Key::KeyA => 65,
        rdev::Key::KeyB => 66,
        rdev::Key::KeyC => 67,
        rdev::Key::KeyD => 68,
        rdev::Key::KeyE => 69,
        rdev::Key::KeyF => 70,
        rdev::Key::KeyG => 71,
        rdev::Key::KeyH => 72,
        rdev::Key::KeyI => 73,
        rdev::Key::KeyJ => 74,
        rdev::Key::KeyK => 75,
        rdev::Key::KeyL => 76,
        rdev::Key::KeyM => 77,
        rdev::Key::KeyN => 78,
        rdev::Key::KeyO => 79,
        rdev::Key::KeyP => 80,
        rdev::Key::KeyQ => 81,
        rdev::Key::KeyR => 82,
        rdev::Key::KeyS => 83,
        rdev::Key::KeyT => 84,
        rdev::Key::KeyU => 85,
        rdev::Key::KeyV => 86,
        rdev::Key::KeyW => 87,
        rdev::Key::KeyX => 88,
        rdev::Key::KeyY => 89,
        rdev::Key::KeyZ => 90,
        rdev::Key::Num0 => 48,
        rdev::Key::Num1 => 49,
        rdev::Key::Num2 => 50,
        rdev::Key::Num3 => 51,
        rdev::Key::Num4 => 52,
        rdev::Key::Num5 => 53,
        rdev::Key::Num6 => 54,
        rdev::Key::Num7 => 55,
        rdev::Key::Num8 => 56,
        rdev::Key::Num9 => 57,
        rdev::Key::Return => 13,
        rdev::Key::Escape => 27,
        rdev::Key::Backspace => 8,
        rdev::Key::Tab => 9,
        rdev::Key::Space => 32,
        rdev::Key::ControlLeft => 17,
        rdev::Key::ControlRight => 17,
        rdev::Key::ShiftLeft => 16,
        rdev::Key::ShiftRight => 16,
        rdev::Key::Alt => 18,
        rdev::Key::AltGr => 18,
        rdev::Key::MetaLeft => 91,
        rdev::Key::MetaRight => 92,
        rdev::Key::CapsLock => 20,
        rdev::Key::F1 => 112,
        rdev::Key::F2 => 113,
        rdev::Key::F3 => 114,
        rdev::Key::F4 => 115,
        rdev::Key::F5 => 116,
        rdev::Key::F6 => 117,
        rdev::Key::F7 => 118,
        rdev::Key::F8 => 119,
        rdev::Key::F9 => 120,
        rdev::Key::F10 => 121,
        rdev::Key::F11 => 122,
        rdev::Key::F12 => 123,
        rdev::Key::LeftArrow => 37,
        rdev::Key::UpArrow => 38,
        rdev::Key::RightArrow => 39,
        rdev::Key::DownArrow => 40,
        rdev::Key::Insert => 45,
        rdev::Key::Delete => 46,
        rdev::Key::Home => 36,
        rdev::Key::End => 35,
        rdev::Key::PageUp => 33,
        rdev::Key::PageDown => 34,
        rdev::Key::SemiColon => 186,
        rdev::Key::Equal => 187,
        rdev::Key::Comma => 188,
        rdev::Key::Minus => 189,
        rdev::Key::Dot => 190,
        rdev::Key::Slash => 191,
        rdev::Key::BackQuote => 192,
        rdev::Key::LeftBracket => 219,
        rdev::Key::BackSlash => 220,
        rdev::Key::RightBracket => 221,
        rdev::Key::Quote => 222,
        _ => 0,
    }
}

#[tauri::command]
fn update_capture_params(quality: u8, sleep_ms: u64) {
    capture::set_quality(quality);
    CAPTURE_SLEEP_MS.store(sleep_ms, Ordering::Relaxed);
}

#[tauri::command]
fn send_mouse_move(x: f64, y: f64, display: Option<usize>) {
    input::move_mouse(x, y, display);
}

#[tauri::command]
fn send_mouse_click(button: u8, down: bool, x: f64, y: f64, display: Option<usize>) {
    input::click_mouse(button, down, x, y, display);
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
        use std::os::windows::process::CommandExt;
        let output = std::process::Command::new("powershell")
            .args(&["-Command", "Get-Clipboard"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let output = std::process::Command::new("xclip")
            .args(&["-selection", "clipboard", "-o"])
            .output();
        match output {
            Ok(out) => Ok(String::from_utf8_lossy(&out.stdout).to_string()),
            Err(_) => Ok("".to_string())
        }
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
        use std::os::windows::process::CommandExt;
        let mut child = std::process::Command::new("powershell")
            .args(&["-Command", "Set-Clipboard"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        child.wait().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        use std::io::Write;
        let child = std::process::Command::new("xclip")
            .args(&["-selection", "clipboard"])
            .stdin(std::process::Stdio::piped())
            .spawn();
        if let Ok(mut c) = child {
            if let Some(mut stdin) = c.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            let _ = c.wait();
        }
        Ok(())
    }
}

#[tauri::command]
fn get_displays() -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(vec!["System screen picker".to_string()])
    }
    #[cfg(target_os = "windows")]
    {
        Ok(vec!["Display 1 (Primary)".to_string()])
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(vec!["Display 1 (Primary)".to_string()])
    }
}

#[tauri::command]
fn set_active_display(index: usize) {
    capture::set_display_index(index);
}

#[tauri::command]
fn js_log(msg: String) {
    println!("[JS LOG] {}", msg);
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) {
    if let Ok(is_fullscreen) = window.is_fullscreen() {
        let _ = window.set_fullscreen(!is_fullscreen);
    }
}

fn main() {
    // Start signaling server automatically in background thread
    tauri::async_runtime::spawn(async {
        start_signaling_server().await;
    });

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            spawn_keyboard_hook(handle);
            Ok(())
        })
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
            set_active_display,
            check_for_update,
            apply_update,
            update_capture_params,
            js_log,
            submit_direct_pairing_answer,
            submit_direct_pairing_decline,
            set_keyboard_hook_active,
            toggle_fullscreen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
