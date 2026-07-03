# LinkUp v0.2.2 (Platform Release Fix)

This maintenance release resolves a Windows-specific compilation failure in the DXGI frame capture backend. 

### Bug Fixes
* **DXGI Capture Sync Fix:** Restored missing synchronization imports (`Mutex` and `LazyLock`) in the Windows capture module inside `src-tauri/src/capture.rs` that caused the Tauri builder to abort. 

This update ensures complete platform support, generating installers for Windows (.exe), Linux (.deb), and macOS (.dmg).
