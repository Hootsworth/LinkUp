# LinkUp

<p align="center">
  <strong>High-performance, decentralized peer-to-peer remote desktop application powered by Rust, Tauri, and WebRTC.</strong>
</p>

<p align="center">
  <a href="https://github.com/Hootsworth/LinkUp/releases"><img src="https://img.shields.io/github/v/release/Hootsworth/LinkUp?style=flat-square" alt="GitHub release"></a>
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="Platforms Supported">
</p>

---

LinkUp connects two devices directly without piping screens, mouse coordinates, keyboard inputs, or files through corporate servers. By leveraging direct P2P connections, LinkUp achieves ultra-low latency remote control, secure end-to-end encryption, and smooth 60fps interaction.

## Key Features

*   ⚡ **LinkUp Direct-Sync Handshake (LDSH)**: A decentralized connection handshake. If devices are on the same local network (or you have direct routing), connect instantly via a direct local HTTP pairing loop on port `8081` bypassing signaling servers entirely.
*   🎥 **Dynamic WebRTC Adaption**: Real-time bandwidth, framerate, and resolution tracking. The host dynamically adapts video tracks to match network conditions and ping times.
*   📁 **P2P File Transfer with Backpressure**: Share files directly with a visual progress overlay. The transfer engine manages 64KB chunks using WebRTC data channel flow control (`onbufferedamountlow`), preventing memory bottlenecks.
*   📋 **Native Clipboard Monitoring**: Active clipboard changes are watched by a native Rust thread in the background, keeping clipboard sync light and instantaneous.
*   🔒 **Pointer Lock Capture**: Capture mouse inputs professionally inside the client viewport by locking cursor states, translating physical delta changes to absolute coordinates on the host.
*   🔊 **System Loopback Audio**: Stream loopback system audio from the host directly alongside the WebRTC video stream for a fully immersive remote experience.
*   🖼️ **Binary JPEG Compatibility Stream**: Automatically falls back to high-frequency raw binary JPEG transport using Tauri IPC and object Blobs if WebRTC video tracks are blocked.

---

## Architecture Overview

LinkUp uses a dual-mode WebRTC signaling architecture:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client Viewer
    actor Host as Host Desktop
    
    rect rgb(240, 240, 240)
        Note over Client, Host: Mode A: Traditional WebSocket Signaling
        Client->>Signaling Server: Register Client Session
        Host->>Signaling Server: Register Host Session with 6-Digit Code
        Client->>Signaling Server: Send SDP Offer (Targeting Host Code)
        Signaling Server->>Host: Deliver SDP Offer
        Host->>Client: Send SDP Answer & ICE Candidates
    end

    rect rgb(230, 245, 230)
        Note over Client, Host: Mode B: LinkUp Direct-Sync Handshake (LDSH)
        Host->>Host: Listen locally on HTTP 0.0.0.0:8081
        Client->>Client: Gather all ICE candidates (Vanilla ICE)
        Client->>Host: HTTP POST /pair (SDP Offer + Candidates)
        Host->>Client: HTTP 200 OK (SDP Answer + Candidates)
    end
    
    Client<-->Host: Establish Direct P2P WebRTC Connection
```

---

## Installation & Download

Pre-compiled platform installers are available on the [Releases Page](https://github.com/Hootsworth/LinkUp/releases) and the public landing page:

*   **macOS (Apple Silicon / Intel)**: Download and mount the `.dmg` installer.
*   **Windows 10 / 11**: Install using the standalone setup `.exe`.
*   **Linux**: Install the `.deb` package on Ubuntu or Debian-based distributions.

---

## Local Development Setup

### Prerequisites

1.  **Node.js**: Ensure Node.js v18+ or v20+ is installed.
2.  **Rust & Cargo**: Follow the setup at [rustup.rs](https://rustup.rs/).
3.  **Tauri CLI Dependencies**:
    *   **macOS**: Native Xcode command line tools.
    *   **Windows**: Visual Studio C++ Build Tools.
    *   **Linux**: Webkit2GTK, AppIndicator, and development packages:
        ```bash
        sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils
        ```

### Getting Started

1.  Clone the repository:
    ```bash
    git clone https://github.com/Hootsworth/LinkUp.git
    cd LinkUp
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Run the application in development mode (spawns both the frontend dev server and Rust/Tauri window):
    ```bash
    npm run tauri dev
    ```

4.  Build the production bundle for your platform:
    ```bash
    npm run tauri build
    ```

---

## Contributing

We welcome contributions! Please review our [Contributing Guide](CONTRIBUTING.md) to understand coding styles, commit formats, and our pull request pipeline.

## License

This project is open-source under the terms of the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
