#[cfg(target_os = "macos")]
mod macos {
    use std::sync::Mutex;
    use std::sync::LazyLock;
    use screencapturekit::prelude::*;
    use screencapturekit::stream::output_trait::SCStreamOutputTrait;
    use screencapturekit::stream::output_type::SCStreamOutputType;
    use screencapturekit::cm::CMSampleBuffer;

    pub static LATEST_FRAME: LazyLock<Mutex<Option<Vec<u8>>>> = LazyLock::new(|| Mutex::new(None));
    pub static MACOS_STREAM: LazyLock<Mutex<Option<SCStream>>> = LazyLock::new(|| Mutex::new(None));
    pub static ACTIVE_DISPLAY_INDEX: LazyLock<Mutex<usize>> = LazyLock::new(|| Mutex::new(0));

    pub fn set_display_index(index: usize) {
        let mut lock = ACTIVE_DISPLAY_INDEX.lock().unwrap();
        *lock = index;
    }

    #[derive(Clone, Copy)]
    struct FrameHandler;

    impl SCStreamOutputTrait for FrameHandler {
        fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
            if let SCStreamOutputType::Screen = of_type {
                if let Some(pixel_buffer) = sample.image_buffer() {
                    use screencapturekit::cv::CVPixelBufferLockFlags;
                    if let Ok(guard) = pixel_buffer.lock(CVPixelBufferLockFlags::READ_ONLY) {
                        let base_address = guard.base_address();
                        let bytes_per_row = pixel_buffer.bytes_per_row();
                        let width = pixel_buffer.width();
                        let height = pixel_buffer.height();

                        let len = height * bytes_per_row;
                        let ptr = base_address as *const u8;
                        let raw_data = unsafe { std::slice::from_raw_parts(ptr, len) };

                        // Convert BGRA (standard Mac format) to RGB, skipping row padding
                        let mut rgb_pixels = Vec::with_capacity(width * height * 3);
                        for y in 0..height {
                            let row_start = y * bytes_per_row;
                            for x in 0..width {
                                let px = row_start + x * 4;
                                if px + 2 < len {
                                    let b = raw_data[px];
                                    let g = raw_data[px + 1];
                                    let r = raw_data[px + 2];
                                    rgb_pixels.push(r);
                                    rgb_pixels.push(g);
                                    rgb_pixels.push(b);
                                }
                            }
                        }

                        // Encode RGB pixels to JPEG at low quality to stay
                        // well under WebRTC data channel's ~256KB message limit.
                        let mut jpeg_bytes = Vec::new();
                        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, 35);
                        if encoder.encode(&rgb_pixels, width as u32, height as u32, image::ColorType::Rgb8).is_ok() {
                            let mut lock = LATEST_FRAME.lock().unwrap();
                            *lock = Some(jpeg_bytes);
                        }
                    }
                }
            }
        }
    }

    pub fn start_capture() -> Result<(), String> {
        let content = SCShareableContent::get().map_err(|e| e.to_string())?;
        let displays = content.displays();
        if displays.is_empty() {
            return Err("No displays found".to_string());
        }
        
        let index = *ACTIVE_DISPLAY_INDEX.lock().unwrap();
        let display = if index < displays.len() { &displays[index] } else { &displays[0] };

        let filter = SCContentFilter::create()
            .with_display(display)
            .with_excluding_windows(&[])
            .build();

        // 960x540 keeps JPEG frames well under the WebRTC 256KB data channel limit
        let config = SCStreamConfiguration::new()
            .with_width(960)
            .with_height(540)
            .with_shows_cursor(true);

        let mut stream = SCStream::new(&filter, &config);
        stream.add_output_handler(FrameHandler, SCStreamOutputType::Screen);
        stream.start_capture().map_err(|e| e.to_string())?;

        let mut lock = MACOS_STREAM.lock().unwrap();
        *lock = Some(stream);

        Ok(())
    }

    pub fn stop_capture() {
        let mut lock = MACOS_STREAM.lock().unwrap();
        if let Some(stream) = lock.take() {
            let _ = stream.stop_capture();
        }
        let mut frame_lock = LATEST_FRAME.lock().unwrap();
        *frame_lock = None;
    }

    pub fn get_latest_frame() -> Option<Vec<u8>> {
        LATEST_FRAME.lock().unwrap().clone()
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::sync::Mutex;
    use std::sync::LazyLock;
    use dxgi_capture_rs::DXGIManager;

    static DXGI_MANAGER: LazyLock<Mutex<Option<DXGIManager>>> = LazyLock::new(|| Mutex::new(None));

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
                    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, 35);
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
pub use macos::{get_latest_frame, start_capture, stop_capture, set_display_index};

#[cfg(target_os = "windows")]
pub use windows::{get_latest_frame, start_capture, stop_capture, set_display_index};

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
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use fallback::{get_latest_frame, start_capture, stop_capture, set_display_index};
