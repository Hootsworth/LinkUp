#[cfg(target_os = "macos")]
mod macos {
    use std::sync::atomic::{AtomicBool, Ordering};

    static LEFT_DOWN: AtomicBool = AtomicBool::new(false);
    static RIGHT_DOWN: AtomicBool = AtomicBool::new(false);

    #[repr(C)]
    #[derive(Clone, Copy, Debug)]
    pub struct CGPoint {
        pub x: f64,
        pub y: f64,
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGMainDisplayID() -> u32;
        fn CGDisplayPixelsWide(display: u32) -> usize;
        fn CGDisplayPixelsHigh(display: u32) -> usize;
        fn CGEventCreateMouseEvent(
            source: *mut std::ffi::c_void,
            mouse_type: u32,
            mouse_cursor_position: CGPoint,
            mouse_button: u32,
        ) -> *mut std::ffi::c_void;
        fn CGEventCreateKeyboardEvent(
            source: *mut std::ffi::c_void,
            key: u16,
            key_down: bool,
        ) -> *mut std::ffi::c_void;
        fn CGEventPost(tap: u32, event: *mut std::ffi::c_void);
        fn CFRelease(cf: *mut std::ffi::c_void);
    }

    pub fn move_mouse(x_norm: f64, y_norm: f64) {
        let display_id = unsafe { CGMainDisplayID() };
        let w = unsafe { CGDisplayPixelsWide(display_id) } as f64;
        let h = unsafe { CGDisplayPixelsHigh(display_id) } as f64;
        let pos = CGPoint { x: x_norm * w, y: y_norm * h };

        let left_down = LEFT_DOWN.load(Ordering::Relaxed);
        let right_down = RIGHT_DOWN.load(Ordering::Relaxed);

        let mouse_type = if left_down {
            6 // kCGEventLeftMouseDragged
        } else if right_down {
            7 // kCGEventRightMouseDragged
        } else {
            5 // kCGEventMouseMoved
        };

        let event = unsafe { CGEventCreateMouseEvent(std::ptr::null_mut(), mouse_type, pos, 0) };
        if !event.is_null() {
            unsafe {
                CGEventPost(0, event); // kCGHIDEventTap = 0
                CFRelease(event);
            }
        }
    }

    pub fn click_mouse(button: u8, down: bool, x_norm: f64, y_norm: f64) {
        let display_id = unsafe { CGMainDisplayID() };
        let w = unsafe { CGDisplayPixelsWide(display_id) } as f64;
        let h = unsafe { CGDisplayPixelsHigh(display_id) } as f64;
        let pos = CGPoint { x: x_norm * w, y: y_norm * h };

        let (mouse_type, mouse_btn) = match button {
            0 => {
                LEFT_DOWN.store(down, Ordering::Relaxed);
                if down { (1, 0) } else { (2, 0) } // LeftMouseDown, LeftMouseUp
            }
            1 => {
                RIGHT_DOWN.store(down, Ordering::Relaxed);
                if down { (3, 1) } else { (4, 1) } // RightMouseDown, RightMouseUp
            }
            _ => {
                if down { (25, 2) } else { (26, 2) } // OtherMouseDown, OtherMouseUp
            }
        };

        let event = unsafe { CGEventCreateMouseEvent(std::ptr::null_mut(), mouse_type, pos, mouse_btn) };
        if !event.is_null() {
            unsafe {
                CGEventPost(0, event); // kCGHIDEventTap = 0
                CFRelease(event);
            }
        }
    }

    pub fn key_event(keycode: u16, down: bool) {
        let mac_keycode = map_vk_to_macos(keycode);
        if mac_keycode == 0 && keycode != 65 {
            // Let 'A' key (code 65) map to mac keycode 0. All other 0 mapping returns should be skipped.
            return;
        }
        let event = unsafe { CGEventCreateKeyboardEvent(std::ptr::null_mut(), mac_keycode, down) };
        if !event.is_null() {
            unsafe {
                CGEventPost(0, event);
                CFRelease(event);
            }
        }
    }

    fn map_vk_to_macos(vk: u16) -> u16 {
        match vk {
            65 => 0,   // A
            66 => 11,  // B
            67 => 8,   // C
            68 => 2,   // D
            69 => 14,  // E
            70 => 3,   // F
            71 => 5,   // G
            72 => 4,   // H
            73 => 34,  // I
            74 => 38,  // J
            75 => 40,  // K
            76 => 37,  // L
            77 => 46,  // M
            78 => 45,  // N
            79 => 31,  // O
            80 => 35,  // P
            81 => 12,  // Q
            82 => 15,  // R
            83 => 1,   // S
            84 => 17,  // T
            85 => 32,  // U
            86 => 9,   // V
            87 => 13,  // W
            88 => 7,   // X
            89 => 16,  // Y
            90 => 6,   // Z
            48 => 29,  // 0
            49 => 18,  // 1
            50 => 19,  // 2
            51 => 20,  // 3
            52 => 21,  // 4
            53 => 23,  // 5
            54 => 22,  // 6
            55 => 26,  // 7
            56 => 28,  // 8
            57 => 25,  // 9
            13 => 36,  // Enter
            32 => 49,  // Space
            8 => 51,   // Backspace
            27 => 53,  // Escape
            9 => 48,   // Tab
            16 => 56,  // Shift
            17 => 59,  // Control
            18 => 58,  // Option / Alt
            91 | 93 => 55, // Windows Key / Command
            37 => 123, // ArrowLeft
            39 => 124, // ArrowRight
            40 => 125, // ArrowDown
            38 => 126, // ArrowUp
            _ => 0,
        }
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::mem;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP, MOUSEINPUT,
        MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
        MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
    };

    pub fn move_mouse(x_norm: f64, y_norm: f64) {
        unsafe {
            // Map 0.0..1.0 coordinate to 0..65535 coordinate expected by MOUSEEVENTF_ABSOLUTE
            let x = (x_norm * 65535.0) as i32;
            let y = (y_norm * 65535.0) as i32;

            let mut input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: mem::zeroed(),
            };

            input.Anonymous.mi = MOUSEINPUT {
                dx: x,
                dy: y,
                mouseData: 0,
                dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                time: 0,
                dwExtraInfo: 0,
            };

            SendInput(1, &input, mem::size_of::<INPUT>() as i32);
        }
    }

    pub fn click_mouse(button: u8, down: bool, x_norm: f64, y_norm: f64) {
        unsafe {
            // First move to coordinate
            move_mouse(x_norm, y_norm);

            let dw_flags = match button {
                0 => {
                    if down { MOUSEEVENTF_LEFTDOWN } else { MOUSEEVENTF_LEFTUP }
                }
                1 => {
                    if down { MOUSEEVENTF_RIGHTDOWN } else { MOUSEEVENTF_RIGHTUP }
                }
                _ => {
                    if down { MOUSEEVENTF_MIDDLEDOWN } else { MOUSEEVENTF_MIDDLEUP }
                }
            };

            let mut input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: mem::zeroed(),
            };

            input.Anonymous.mi = MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: dw_flags,
                time: 0,
                dwExtraInfo: 0,
            };

            SendInput(1, &input, mem::size_of::<INPUT>() as i32);
        }
    }

    pub fn key_event(keycode: u16, down: bool) {
        unsafe {
            let mut input = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: mem::zeroed(),
            };

            input.Anonymous.ki = KEYBDINPUT {
                wVk: keycode,
                wScan: 0,
                dwFlags: if down { 0 } else { KEYEVENTF_KEYUP },
                time: 0,
                dwExtraInfo: 0,
            };

            SendInput(1, &input, mem::size_of::<INPUT>() as i32);
        }
    }
}

// Public API exports
#[cfg(target_os = "macos")]
pub use macos::{click_mouse, key_event, move_mouse};

#[cfg(target_os = "windows")]
pub use windows::{click_mouse, key_event, move_mouse};

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod fallback {
    pub fn move_mouse(_x: f64, _y: f64) {}
    pub fn click_mouse(_button: u8, _down: bool, _x: f64, _y: f64) {}
    pub fn key_event(_keycode: u16, _down: bool) {}
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use fallback::{click_mouse, key_event, move_mouse};
