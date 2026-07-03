#[cfg(target_os = "macos")]
mod macos {
    pub fn start_capture() -> Result<(), String> {
        Err("Native macOS JPEG fallback is disabled; use the HD WebRTC screen picker.".to_string())
    }

    pub fn stop_capture() {}

    pub fn get_latest_frame() -> Option<Vec<u8>> {
        None
    }

    pub fn set_display_index(_index: usize) {}
    pub fn set_quality(_q: u8) {}
}

#[cfg(target_os = "windows")]
mod windows {
    use std::sync::{Mutex, LazyLock};
    use std::sync::atomic::{AtomicU8, Ordering};
    use dxgi_capture_rs::DXGIManager;

    static DXGI_MANAGER: LazyLock<Mutex<Option<DXGIManager>>> = LazyLock::new(|| Mutex::new(None));
    static JPEG_QUALITY: AtomicU8 = AtomicU8::new(78);

    pub fn set_quality(q: u8) {
        JPEG_QUALITY.store(q, Ordering::Relaxed);
    }

    pub fn start_capture() -> Result<(), String> {
        let manager = DXGIManager::new(1000).map_err(|e| format!("{:?}", e))?;
        let mut lock = DXGI_MANAGER.lock().unwrap();
        *lock = Some(manager);
        Ok(())
    }

    pub fn stop_capture() {
        let mut lock = DXGI_MANAGER.lock().unwrap();
        *lock = None;
    }

    pub fn get_latest_frame() -> Option<Vec<u8>> {
        let mut lock = DXGI_MANAGER.lock().unwrap();
        if let Some(ref mut manager) = *lock {
            match manager.capture_frame_components() {
                Ok((bgra_bytes, (width, height))) => {
                    let mut rgb_bytes = Vec::with_capacity(width * height * 3);
                    for chunk in bgra_bytes.chunks_exact(4) {
                        let b = chunk[0];
                        let g = chunk[1];
                        let r = chunk[2];
                        rgb_bytes.push(r);
                        rgb_bytes.push(g);
                        rgb_bytes.push(b);
                    }
                    let mut jpeg_bytes = Vec::new();
                    let quality = JPEG_QUALITY.load(Ordering::Relaxed);
                    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, quality);
                    if encoder.encode(&rgb_bytes, width as u32, height as u32, image::ColorType::Rgb8).is_ok() {
                        Some(jpeg_bytes)
                    } else {
                        None
                    }
                }
                _ => None,
            }
        } else {
            None
        }
    }

    pub fn set_display_index(_index: usize) {
        // Multi-monitor support fallback for Windows DXGI
    }
}

#[cfg(target_os = "macos")]
pub use macos::{get_latest_frame, start_capture, stop_capture, set_display_index, set_quality};

#[cfg(target_os = "windows")]
pub use windows::{get_latest_frame, start_capture, stop_capture, set_display_index, set_quality};

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod fallback {
    pub fn start_capture() -> Result<(), String> {
        Ok(())
    }
    pub fn stop_capture() {}
    pub fn get_latest_frame() -> Option<Vec<u8>> {
        None
    }
    pub fn set_display_index(_index: usize) {}
    pub fn set_quality(_q: u8) {}
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use fallback::{get_latest_frame, start_capture, stop_capture, set_display_index, set_quality};
