# LinkUp v0.2.1 (Maintenance Update)

This maintenance release introduces critical connection stability and performance optimizations to the remote streaming and control experience.

### Key Enhancements

* **Canvas WebRTC Video Track Stream:** Replaced high-latency Base64 JPEG data channel transmissions with a native WebRTC video track stream captured via a hidden canvas. Stream compression is handled by hardware-accelerated H.264/VP8 codecs inside the WebView.
* **WebView Background Keep-Alive:** Implements a silent Web Audio loop to prevent the host OS from throttling or suspending the background WebView, maintaining immediate connection responses when blurred.
* **0ms Client Cursor Echo:** Repositions a local pointer dot overlay instantly on viewer mouse movements, bypassing network transport delays for instant feedback.
* **Dynamic Congestion Control:** Periodically monitors active candidate ping latency (RTT) and dynamically scales host capture framerates (6fps to 30fps) and encoding quality on-the-fly to prevent stuttering.
