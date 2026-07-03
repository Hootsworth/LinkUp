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

static CAPTURE_RUNNING: LazyLock<Arc<AtomicBool>> = LazyLock::new(|| Arc::new(AtomicBool::new(false)));
static CAPTURE_SLEEP_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(33);

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
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", temp_file_path.to_str().unwrap_or("")])
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
async fn start_host(app: tauri::AppHandle) -> Result<(), String> {
    capture::start_capture()?;
    
    let running = CAPTURE_RUNNING.clone();
    running.store(true, Ordering::Relaxed);
    
    tauri::async_runtime::spawn(async move {
        use base64::{Engine as _, engine::general_purpose};
        while running.load(Ordering::Relaxed) {
            if let Some(frame) = capture::get_latest_frame() {
                let b64 = general_purpose::STANDARD.encode(&frame);
                match app.emit("local-frame", &b64) {
                    Ok(_) => println!("[RUST DEBUG] app.emit local-frame succeeded (len: {})", b64.len()),
                    Err(e) => println!("[RUST ERROR] app.emit local-frame failed: {:?}", e),
                }
            }
            let sleep_ms = CAPTURE_SLEEP_MS.load(Ordering::Relaxed);
            tokio::time::sleep(tokio::time::Duration::from_millis(sleep_ms)).await;
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
fn update_capture_params(quality: u8, sleep_ms: u64) {
    capture::set_quality(quality);
    CAPTURE_SLEEP_MS.store(sleep_ms, Ordering::Relaxed);
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

fn main() {
    // Start signaling server automatically in background thread
    tauri::async_runtime::spawn(async {
        start_signaling_server().await;
    });

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
            set_active_display,
            check_for_update,
            apply_update,
            update_capture_params,
            js_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
