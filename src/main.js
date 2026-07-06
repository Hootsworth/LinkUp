// Destructure Tauri APIs
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// Override console to print to backend stdout for absolute debug visibility
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

console.log = (...args) => {
  origLog(...args);
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  invoke("js_log", { msg: `[LOG] ${text}` }).catch(() => {});
};
console.error = (...args) => {
  origError(...args);
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  invoke("js_log", { msg: `[ERROR] ${text}` }).catch(() => {});
};
console.warn = (...args) => {
  origWarn(...args);
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  invoke("js_log", { msg: `[WARN] ${text}` }).catch(() => {});
};

// UI Screens
const viewOnboarding = document.getElementById("screen-onboarding");
const viewSelection = document.getElementById("screen-selection");
const viewHosting = document.getElementById("screen-hosting");
const viewClientConfig = document.getElementById("screen-client-config");
const viewRemoteView = document.getElementById("screen-remote-view");
const viewSettings = document.getElementById("screen-settings");

// Selection Page Buttons
const btnModeHost = document.getElementById("btn-mode-host");
const btnModeClient = document.getElementById("btn-mode-client");

// Host Page Elements
const btnStopHosting = document.getElementById("btn-stop-hosting");
const localConnectionCode = document.getElementById("local-connection-code");
const hostStatusText = document.getElementById("host-status-text");
const hostStatusDot = document.getElementById("host-status-dot");
const hostIpAddress = document.getElementById("host-ip-address");

// Client Config Page Elements
const btnClientBack = document.getElementById("btn-client-back");
const btnClientConnect = document.getElementById("btn-client-connect");
const inputHostCode = document.getElementById("input-host-code");
const inputClientSigUrl = document.getElementById("input-client-sig-url");
const clientError = document.getElementById("client-error");

// Viewport Page Elements
const btnClientDisconnect = document.getElementById("btn-client-disconnect");
const remoteScreenVideo = document.getElementById("remote-screen-video");
const remoteScreenVideoSecondary = document.getElementById("remote-screen-video-secondary");
const videoWrapperPrimary = document.getElementById("video-wrapper-primary");
const videoWrapperSecondary = document.getElementById("video-wrapper-secondary");
const selectRemoteLayout = document.getElementById("select-remote-layout");
const floatingLayoutContainer = document.getElementById("floating-layout-container");
const btnClientFullscreen = document.getElementById("btn-client-fullscreen");
const remoteScreenImg = document.getElementById("remote-screen-img");
const remoteHostInfo = document.getElementById("remote-host-info");

// Connection Settings Panel Elements
const btnToggleSettings = document.getElementById("btn-toggle-settings");
const btnSaveSettings = document.getElementById("btn-save-settings");
const btnSettingsBack = document.getElementById("btn-settings-back");
const inputSigUrl = document.getElementById("input-sig-url");
const selectTurnProfile = document.getElementById("select-turn-profile");
const customTurnFields = document.getElementById("custom-turn-fields");
const inputTurnUrl = document.getElementById("input-turn-url");
const inputTurnUser = document.getElementById("input-turn-user");
const inputTurnPass = document.getElementById("input-turn-pass");
const selectDisplay = document.getElementById("select-display");

// Security Handshake Elements
const securityDialog = document.getElementById("security-dialog");
const securityRequestMessage = document.getElementById("security-request-message");
const btnSecurityAccept = document.getElementById("btn-security-accept");
const btnSecurityDecline = document.getElementById("btn-security-decline");

// Update Notification Elements
const updateDialog = document.getElementById("update-dialog");
const updateTitle = document.getElementById("update-title");
const updateDetails = document.getElementById("update-details");
const btnUpdateAccept = document.getElementById("btn-update-accept");
const btnUpdateDecline = document.getElementById("btn-update-decline");
const updateProgressContainer = document.getElementById("update-progress-container");
const updateProgressBar = document.getElementById("update-progress-bar");
const updateProgressLabel = document.getElementById("update-progress-label");
const updateButtonRow = document.getElementById("update-button-row");

// Onboarding Elements
const slides = Array.from(document.querySelectorAll(".onboarding-slide"));
const dots = Array.from(document.querySelectorAll(".slide-dot"));
const btnOnboardSkip = document.getElementById("btn-onboard-skip");
const btnOnboardNext = document.getElementById("btn-onboard-next");

// Advanced Features HUD, Checklist & History Elements
const checkAllowInput = document.getElementById("check-allow-input");
const checkAllowClipboard = document.getElementById("check-allow-clipboard");
const btnTransferFile = document.getElementById("btn-transfer-file");
const inputFileSelect = document.getElementById("input-file-select");
const fileProgressHud = document.getElementById("file-progress-hud");
const fileProgressName = document.getElementById("file-progress-name");
const fileProgressStatus = document.getElementById("file-progress-status");
const fileProgressPercent = document.getElementById("file-progress-percent");
const fileProgressBar = document.getElementById("file-progress-bar");
const hudStats = document.getElementById("hud-stats");
const hudType = document.getElementById("hud-type");
const hudPing = document.getElementById("hud-ping");
const hudRes = document.getElementById("hud-res");
const hudFps = document.getElementById("hud-fps");
const hudRate = document.getElementById("hud-rate");
const recentSessionsContainer = document.getElementById("recent-sessions-container");
const recentListItems = document.getElementById("recent-list-items");
const localCursorEcho = document.getElementById("local-cursor-echo");

// WebRTC & Signaling state
let sigWs = null;
let peerConnection = null;
let screenChannel = null;
let inputChannel = null;
let fileChannel = null; // Dedicated binary file transfer datachannel
let localTauriFrameUnlisten = null;
let localTauriClipboardUnlisten = null;
let localScreenStream = null;
let remoteStreams = [];
let activeRole = null; // 'host' or 'client'
let currentSlideIndex = 0;

// Polish State
let lastSentClipboardText = "";
let clipboardInterval = null;
let heartbeatInterval = null;
let lastHeartbeatTime = 0;
let isReconnecting = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 5;
let savedHostCode = null;
let savedClientId = null;

// Diagnostics & File State
let receivedChunks = [];
let incomingFileInfo = null;
let hudInterval = null;
let prevBytesReceived = 0;
let prevFramesDecoded = 0;
let prevTimestamp = 0;
let virtualMouseX = 0.5;
let virtualMouseY = 0.5;
const MAX_SCREEN_BUFFER_BYTES = 4 * 1024 * 1024;

// ICE candidate buffer — holds candidates that arrive at the host before
// the user clicks Accept (before peerConnection is created).
let iceCandidateBuffer = [];

// ----------------------------------------------------
// CONNECTION INFRASTRUCTURE SETTINGS (localStorage)
// ----------------------------------------------------
function loadSettings() {
  const sigUrl = localStorage.getItem("linkup_sig_url") || "ws://localhost:8080";
  const turnProfile = localStorage.getItem("linkup_turn_profile") || "community";
  const turnUrl = localStorage.getItem("linkup_turn_url") || "";
  const turnUser = localStorage.getItem("linkup_turn_user") || "linkupuser";
  const turnPass = localStorage.getItem("linkup_turn_pass") || "linkuppassword";
  
  inputSigUrl.value = sigUrl;
  selectTurnProfile.value = turnProfile;
  inputTurnUrl.value = turnUrl;
  inputTurnUser.value = turnUser;
  inputTurnPass.value = turnPass;

  if (turnProfile === "custom") {
    customTurnFields.style.display = "grid";
  } else {
    customTurnFields.style.display = "none";
  }
}

function saveSettings() {
  localStorage.setItem("linkup_sig_url", inputSigUrl.value.trim());
  localStorage.setItem("linkup_turn_profile", selectTurnProfile.value);
  localStorage.setItem("linkup_turn_url", inputTurnUrl.value.trim());
  localStorage.setItem("linkup_turn_user", inputTurnUser.value.trim());
  localStorage.setItem("linkup_turn_pass", inputTurnPass.value.trim());
}

// Generate dynamic ICE configuration based on settings
function getIceConfiguration() {
  const profile = selectTurnProfile.value;
  
  const servers = [
    { urls: "stun:stun.l.google.com:19302" } // Public Google STUN
  ];
  
  if (profile === "community") {
    servers.push({
      urls: "turn:relay.linkup.app:3478",
      username: "community",
      credential: "password"
    });
  } else if (profile === "custom") {
    const turnUrl = inputTurnUrl.value.trim();
    const turnUser = inputTurnUser.value.trim();
    const turnPass = inputTurnPass.value.trim();
    
    if (turnUrl) {
      servers.push({
        urls: turnUrl,
        username: turnUser,
        credential: turnPass
      });
    }
  }
  
  return { iceServers: servers };
}

// Settings Actions
selectTurnProfile.addEventListener("change", () => {
  if (selectTurnProfile.value === "custom") {
    customTurnFields.style.display = "grid";
  } else {
    customTurnFields.style.display = "none";
  }
});

btnToggleSettings.addEventListener("click", () => {
  showScreen(viewSettings);
});

btnSaveSettings.addEventListener("click", () => {
  saveSettings();
  showScreen(viewSelection);
  console.log("Settings saved.");
});

btnSettingsBack.addEventListener("click", () => {
  showScreen(viewSelection);
});

// Display Discovery
async function discoverDisplays() {
  try {
    const list = await invoke("get_displays");
    selectDisplay.innerHTML = "";
    list.forEach((disp, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = disp;
      selectDisplay.appendChild(opt);
    });
  } catch (e) {
    console.error("Error discovering displays:", e);
  }
}

// Display Switch Handler
selectDisplay.addEventListener("change", async () => {
  const index = parseInt(selectDisplay.value);
  await invoke("set_active_display", { index });
  console.log(`Switched display to: ${index}`);
  
  // Display selection applies to the native JPEG compatibility stream.
  // WebRTC video capture uses the system picker when the host accepts a viewer.
  if (activeRole === "host" && localTauriFrameUnlisten) {
    await invoke("stop_host");
    await invoke("start_host");
    console.log("Restarted capture loop with new display target");
  }
});

// ----------------------------------------------------
// ONBOARDING SLIDES SYSTEM
// ----------------------------------------------------
function goToSlide(index) {
  slides[currentSlideIndex].classList.remove("active");
  dots[currentSlideIndex].classList.remove("active");
  
  currentSlideIndex = index;
  
  slides[currentSlideIndex].classList.add("active");
  dots[currentSlideIndex].classList.add("active");
  
  if (currentSlideIndex === slides.length - 1) {
    btnOnboardNext.textContent = "Get Started";
  } else {
    btnOnboardNext.textContent = "Next";
  }
}

btnOnboardNext.addEventListener("click", () => {
  if (currentSlideIndex < slides.length - 1) {
    goToSlide(currentSlideIndex + 1);
  } else {
    completeOnboarding();
  }
});

btnOnboardSkip.addEventListener("click", () => {
  completeOnboarding();
});

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    goToSlide(index);
  });
});

function completeOnboarding() {
  localStorage.setItem("linkup_onboarded", "true");
  viewOnboarding.classList.remove("active");
  showScreen(viewSelection);
}

// Page Navigation
function showScreen(screen) {
  [viewOnboarding, viewSelection, viewHosting, viewClientConfig, viewRemoteView, viewSettings].forEach(s => {
    s.classList.remove("active");
  });
  screen.classList.add("active");
}

function cleanupWebRTC() {
  console.log("Cleaning up WebRTC state");
  activeRole = null;
  
  if (clipboardInterval) {
    clearInterval(clipboardInterval);
    clipboardInterval = null;
  }
  
  if (hudInterval) {
    clearInterval(hudInterval);
    hudInterval = null;
  }
  
  if (localTauriFrameUnlisten) {
    localTauriFrameUnlisten();
    localTauriFrameUnlisten = null;
  }

  if (localTauriClipboardUnlisten) {
    localTauriClipboardUnlisten();
    localTauriClipboardUnlisten = null;
  }
  
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => track.stop());
    localScreenStream = null;
  }
  
  if (screenChannel) {
    try { screenChannel.close(); } catch(e){}
    screenChannel = null;
  }
  if (inputChannel) {
    try { inputChannel.close(); } catch(e){}
    inputChannel = null;
  }
  if (fileChannel) {
    try { fileChannel.close(); } catch(e){}
    fileChannel = null;
  }
  if (peerConnection) {
    try { peerConnection.close(); } catch(e){}
    peerConnection = null;
  }
  if (sigWs) {
    try { sigWs.close(); } catch(e){}
    sigWs = null;
  }
  
  hideFileProgressOverlay();
  stopKeepWebviewAlive();
  
  invoke("stop_host").catch(console.error);
  
  if (remoteScreenVideo.srcObject) {
    remoteScreenVideo.srcObject.getTracks().forEach(track => track.stop());
  }
  remoteScreenVideo.srcObject = null;
  remoteScreenVideo.classList.remove("fallback-hidden");

  if (remoteScreenVideoSecondary.srcObject) {
    remoteScreenVideoSecondary.srcObject.getTracks().forEach(track => track.stop());
  }
  remoteScreenVideoSecondary.srcObject = null;
  remoteScreenVideoSecondary.classList.remove("fallback-hidden");

  remoteStreams = [];
  floatingLayoutContainer.style.display = "none";
  const viewportContainer = document.getElementById("viewport-container");
  if (viewportContainer) {
    viewportContainer.className = "remote-viewport-container";
  }

  remoteScreenImg.src = "";
  remoteScreenImg.classList.remove("fallback-active");
  clientError.style.display = "none";
  iceCandidateBuffer = []; // clear any buffered candidates from previous session
  securityDialog.classList.remove("open");
}

function resetSession() {
  cleanupWebRTC();
  showScreen(viewSelection);
  reconnectAttempts = 0;
}

const MNEMONIC_WORDS = [
  "crane", "yellow", "sunset", "ocean", "breeze", "mountain", "forest", "river", "glacier", "desert",
  "cactus", "canyon", "meadow", "valley", "spring", "autumn", "winter", "summer", "canopy", "pebble",
  "shadow", "light", "aurora", "comet", "galaxy", "nebula", "planet", "crater", "crescent", "horizon",
  "summit", "tundra", "island", "lagoon", "harbor", "anchor", "compass", "beacon", "voyage", "safari"
];

function generateSessionCode() {
  const w1 = MNEMONIC_WORDS[Math.floor(Math.random() * MNEMONIC_WORDS.length)];
  const w2 = MNEMONIC_WORDS[Math.floor(Math.random() * MNEMONIC_WORDS.length)];
  const w3 = MNEMONIC_WORDS[Math.floor(Math.random() * MNEMONIC_WORDS.length)];
  return `${w1}-${w2}-${w3}`;
}

function formatConnectionCode(code) {
  if (!code) return "";
  if (code.includes("-")) return code;
  if (code.length === 6) return code.slice(0, 3) + " " + code.slice(3);
  return code;
}

// ----------------------------------------------------
// 1. HOST MODE
// ----------------------------------------------------
btnModeHost.addEventListener("click", () => {
  const code = generateSessionCode();
  const sigUrl = inputSigUrl.value.trim() || "ws://localhost:8080";
  
  // Initialize Rust backend hosting (HTTP direct server, capture, clipboard)
  invoke("start_host", { code }).catch(console.error);
  
  showScreen(viewHosting);
  hostStatusText.textContent = "Connecting to signaling server...";
  hostStatusDot.className = "status-dot pulsing";
  localConnectionCode.textContent = "------";
  hostIpAddress.textContent = "Fetching...";
  activeRole = "host";

  // Fetch local IP address
  invoke("get_local_ip").then((ip) => {
    hostIpAddress.textContent = ip;
  }).catch((err) => {
    console.error("Failed to fetch local IP:", err);
    hostIpAddress.textContent = "Unknown";
  });

  let isRegistered = false;

  try {
    sigWs = new WebSocket(sigUrl);
    
    sigWs.onopen = () => {
      sigWs.send(JSON.stringify({ type: 'register', id: code }));
    };

    sigWs.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'registered') {
        isRegistered = true;
        localConnectionCode.textContent = formatConnectionCode(msg.id);
        hostStatusText.textContent = "Waiting for connection phrase pairing...";
      }
      
      else if (msg.type === 'signal') {
        const senderId = msg.sender;
        const data = msg.data;
        
        if (data.sdp && data.sdp.type === "offer") {
          handleOfferSignal(
            senderId,
            data.sdp,
            (answer, usingVideoTrack) => {
              sigWs.send(JSON.stringify({
                type: 'signal',
                target: senderId,
                data: { sdp: answer, mode: usingVideoTrack ? "video" : "jpeg-fallback" }
              }));
            },
            () => {
              sigWs.send(JSON.stringify({
                type: 'signal',
                target: senderId,
                data: { rejected: true }
              }));
            }
          );
        } else if (data.candidate) {
          if (peerConnection && peerConnection.remoteDescription) {
            // Peer connection is ready — apply immediately.
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            // Peer connection not ready yet (host hasn't clicked Accept).
            // Buffer the candidate so it can be flushed after acceptance.
            console.log("Buffering ICE candidate (peer not ready)");
            iceCandidateBuffer.push(data.candidate);
          }
        }
      }
      
      else if (msg.type === 'error') {
        console.error("Signaling error message:", msg.message);
        hostStatusText.textContent = msg.message;
        hostStatusDot.className = "status-dot red";
      }
    };

    sigWs.onerror = (e) => {
      console.error("Signaling connection error:", e);
      if (activeRole === "host") {
        hostStatusText.textContent = "Signaling offline. Make sure server is running.";
        hostStatusDot.className = "status-dot red";
      }
    };

    sigWs.onclose = () => {
      if (activeRole === "host") {
        if (isRegistered) {
          hostStatusText.textContent = "Signaling connection lost.";
          hostStatusDot.className = "status-dot red";
        } else {
          hostStatusText.textContent = "Signaling offline. Make sure server is running.";
          hostStatusDot.className = "status-dot red";
        }
      }
    };

  } catch (err) {
    console.error("Hosting error exception:", err);
    if (activeRole === "host") {
      hostStatusText.textContent = "Signaling configuration failed.";
      hostStatusDot.className = "status-dot red";
    }
  }
});

function setupHostPeerConnection(senderId) {
  peerConnection = new RTCPeerConnection(getIceConfiguration());
  
  peerConnection.onicecandidate = (e) => {
    if (e.candidate && sigWs && sigWs.readyState === WebSocket.OPEN) {
      sigWs.send(JSON.stringify({
        type: 'signal',
        target: senderId,
        data: { candidate: e.candidate }
      }));
    }
  };
  
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.log("Host connection state change:", state);
    const screenState = screenChannel ? screenChannel.readyState : "null";
    const inputState = inputChannel ? inputChannel.readyState : "null";
    hostStatusText.textContent = `Conn: ${state} | ScreenDC: ${screenState} | InputDC: ${inputState}`;
    
    if (state === "connected") {
      hostStatusDot.className = "status-dot green";
      // Start Host Clipboard Monitor
      startHostClipboardMonitor();
    } else if (state === "disconnected" || state === "failed" || state === "closed") {
      resetSession();
    }
  };
  
  peerConnection.ondatachannel = (event) => {
    const channel = event.channel;
    console.log("Host received data channel:", channel.label);
    
    if (channel.label === "screen") {
      screenChannel = channel;
      // Send the first frame the instant the channel opens.
      screenChannel.onopen = () => {
        console.log("Screen data channel opened on host side");
        hostStatusText.textContent = "Screen channel open — streaming...";
      };
      screenChannel.onerror = (err) => {
        console.error("Screen channel error:", err);
      };
    } else if (channel.label === "input") {
      inputChannel = channel;
      inputChannel.onmessage = (e) => {
        const inputEvent = JSON.parse(e.data);
        if (inputEvent.type === "ping") {
          if (inputChannel.readyState === "open") {
            inputChannel.send(JSON.stringify({ type: "pong" }));
          }
          return;
        }
        if (inputEvent.type === "move" || inputEvent.type === "click" || inputEvent.type === "key") {
          if (checkAllowInput && !checkAllowInput.checked) {
            return;
          }
          if (inputEvent.type === "move") {
            invoke("send_mouse_move", { x: inputEvent.x, y: inputEvent.y, display: inputEvent.display });
          } else if (inputEvent.type === "click") {
            invoke("send_mouse_click", {
              button: inputEvent.button,
              down: inputEvent.down,
              x: inputEvent.x,
              y: inputEvent.y,
              display: inputEvent.display
            });
          } else if (inputEvent.type === "key") {
            invoke("send_key_event", {
              keycode: inputEvent.keycode,
              down: inputEvent.down
            });
          }
        } else if (inputEvent.type === "clipboard") {
          if (checkAllowClipboard && !checkAllowClipboard.checked) {
            return;
          }
          // Sync clipboard natively on Host
          invoke("write_clipboard", { text: inputEvent.text }).catch(console.error);
          lastSentClipboardText = inputEvent.text; // Prevent echo loop
        } else if (inputEvent.type === "adapt-quality") {
          invoke("update_capture_params", {
            quality: inputEvent.quality,
            sleepMs: inputEvent.sleepMs
          }).catch(console.error);

          // Dynamic WebRTC video encoding adaptation
          if (peerConnection) {
            try {
              const senders = peerConnection.getSenders();
              const videoSender = senders.find(s => s.track && s.track.kind === "video");
              if (videoSender) {
                const params = videoSender.getParameters();
                if (!params.encodings || params.encodings.length === 0) {
                  params.encodings = [{}];
                }
                let maxBitrate = 8_000_000;
                let scaleDown = 1.0;
                let maxFps = 30;

                if (inputEvent.quality <= 25) {
                  maxBitrate = 500_000;
                  scaleDown = 2.0;
                  maxFps = 10;
                } else if (inputEvent.quality <= 40) {
                  maxBitrate = 1_200_000;
                  scaleDown = 1.5;
                  maxFps = 15;
                } else if (inputEvent.quality <= 60) {
                  maxBitrate = 3_000_000;
                  scaleDown = 1.0;
                  maxFps = 24;
                }

                params.encodings[0].maxBitrate = maxBitrate;
                params.encodings[0].scaleResolutionDownBy = scaleDown;
                params.encodings[0].maxFramerate = maxFps;
                
                videoSender.setParameters(params).then(() => {
                  console.log(`Adapted WebRTC video track encoding: maxBitrate=${maxBitrate}, scaleDown=${scaleDown}, maxFps=${maxFps}`);
                }).catch(err => {
                  console.warn("Failed to set video track parameters:", err);
                });
              }
            } catch (err) {
              console.warn("Failed to adapt WebRTC video sender params:", err);
            }
          }
        }
      };
    } else if (channel.label === "file") {
      fileChannel = channel;
      setupFileChannelHandlers(fileChannel);
    }
  };
}

async function startHostScreenShare(senderId) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error("WebRTC display capture is not available in this WebView");
    }

    localScreenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const [videoTrack] = localScreenStream.getVideoTracks();
    if (!videoTrack) {
      throw new Error("No screen video track was captured");
    }

    videoTrack.onended = () => {
      if (activeRole === "host") {
        hostStatusText.textContent = "Screen sharing stopped.";
        resetSession();
      }
    };

    // Add all captured tracks (video and audio) to peer connection
    localScreenStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localScreenStream);
    });

    const sender = peerConnection.getSenders().find(s => s.track === videoTrack);
    if (sender) {
      await tuneVideoSender(sender);
    }

    // Secondary monitor capture prompt
    let secondaryStream = null;
    if (confirm("LinkUp: Do you want to capture and share a secondary display for multi-monitor layout?")) {
      try {
        secondaryStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 60 }
          }
        });
        if (secondaryStream) {
          const [secVideoTrack] = secondaryStream.getVideoTracks();
          if (secVideoTrack) {
            secVideoTrack.onended = () => {
              if (activeRole === "host") {
                resetSession();
              }
            };
            const secSender = peerConnection.addTrack(secVideoTrack, secondaryStream);
            await tuneVideoSender(secSender);
            console.log("Secondary WebRTC display track attached successfully.");
          }
        }
      } catch (secErr) {
        console.log("Secondary screen selection cancelled or failed:", secErr);
      }
    }

    hostStatusText.textContent = secondaryStream 
      ? "Streaming dual screens as WebRTC video tracks..." 
      : "Streaming screen as WebRTC video...";
    return true;
  } catch (videoErr) {
    console.warn("WebRTC video capture failed, falling back to JPEG data channel:", videoErr);
    hostStatusText.textContent = "Video capture unavailable. Falling back to compatibility stream...";
    await startJpegFallbackStream();
    return false;
  }
}

async function tuneVideoSender(sender) {
  if (!sender || !sender.getParameters) return;
  const params = sender.getParameters();
  params.encodings = params.encodings && params.encodings.length ? params.encodings : [{}];
  params.encodings[0].maxBitrate = 8_000_000;
  params.encodings[0].maxFramerate = 30;
  params.degradationPreference = "maintain-resolution";
  try {
    await sender.setParameters(params);
  } catch (e) {
    console.warn("Unable to apply video sender tuning:", e);
  }
}

async function startJpegFallbackStream() {
  // Create canvas for WebRTC native video track streaming
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");

  // Capture canvas at 30 fps
  const canvasStream = canvas.captureStream(30);
  const [videoTrack] = canvasStream.getVideoTracks();

  // Add the captured track to the peer connection
  const sender = peerConnection.addTrack(videoTrack, canvasStream);
  await tuneVideoSender(sender);

  let framesSent = 0;
  localTauriFrameUnlisten = await listen("local-frame", (e) => {
    const blob = new Blob([e.payload], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      framesSent++;
      if (framesSent % 30 === 0) {
        hostStatusText.textContent = `WebRTC Video stream: ${framesSent} frames processed`;
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function startHostClipboardMonitor() {
  if (localTauriClipboardUnlisten) {
    localTauriClipboardUnlisten();
    localTauriClipboardUnlisten = null;
  }
  localTauriClipboardUnlisten = await listen("host-clipboard-changed", (e) => {
    if (checkAllowClipboard && !checkAllowClipboard.checked) return;
    const text = e.payload;
    if (text && text !== lastSentClipboardText) {
      lastSentClipboardText = text;
      if (inputChannel && inputChannel.readyState === "open") {
        inputChannel.send(JSON.stringify({ type: "clipboard", text }));
        console.log("Synced native host clipboard update to remote client");
      }
    }
  });
}

btnStopHosting.addEventListener("click", () => {
  resetSession();
});

// ----------------------------------------------------
// 2. CLIENT MODE (VIEWER)
// ----------------------------------------------------
btnModeClient.addEventListener("click", () => {
  showScreen(viewClientConfig);
});

btnClientBack.addEventListener("click", () => {
  showScreen(viewSelection);
});

btnClientConnect.addEventListener("click", () => {
  const code = inputHostCode.value.trim().toLowerCase();
  const parts = code.split("-");
  if (parts.length !== 3 || parts.some(p => p.length < 2)) {
    clientError.textContent = "Please enter a valid 3-word connection phrase (e.g. crane-yellow-sunset)";
    clientError.style.display = "block";
    return;
  }
  
  savedHostCode = code;
  savedClientId = "client_" + generateSessionCode();
  connectClientViewer();
});

function connectClientViewer() {
  const inputIp = inputClientSigUrl.value.trim();
  
  if (inputIp && !inputIp.startsWith("ws://") && !inputIp.startsWith("wss://")) {
    connectDirectClientViewer(inputIp);
    return;
  }
  
  let sigUrl = inputSigUrl.value.trim() || "ws://localhost:8080";
  if (inputIp) {
    sigUrl = inputIp;
  }

  clientError.style.display = "none";
  
  if (reconnectAttempts > 0) {
    remoteHostInfo.textContent = `Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;
  } else {
    btnClientConnect.textContent = "Establishing link...";
    btnClientConnect.disabled = true;
  }
  
  activeRole = "client";

  try {
    sigWs = new WebSocket(sigUrl);
    
    sigWs.onopen = () => {
      sigWs.send(JSON.stringify({ type: 'register', id: savedClientId }));
    };

    sigWs.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'registered') {
        setupClientPeerConnection(savedHostCode, savedClientId);
      }
      
      else if (msg.type === 'signal') {
        const data = msg.data;
        if (data.rejected) {
          clientError.textContent = "Connection declined by host.";
          clientError.style.display = "block";
          btnClientConnect.textContent = "Connect";
          btnClientConnect.disabled = false;
          cleanupWebRTC();
          reconnectAttempts = 0;
        } else if (data.sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      }
      
      else if (msg.type === 'error') {
        handleClientDisconnect(msg.message);
      }
    };

    sigWs.onerror = (e) => {
      handleClientDisconnect("Signaling server connection failed.");
    };

    sigWs.onclose = () => {
      if (activeRole === "client" && reconnectAttempts === 0) {
        resetSession();
        btnClientConnect.textContent = "Connect";
        btnClientConnect.disabled = false;
      }
    };

  } catch (err) {
    handleClientDisconnect(err.toString());
  }
}

async function connectDirectClientViewer(hostIp) {
  clientError.style.display = "none";
  btnClientConnect.textContent = "Direct P2P pairing...";
  btnClientConnect.disabled = true;
  activeRole = "client";
  
  let targetIp = hostIp;
  if (!targetIp.includes(":")) {
    targetIp = `${targetIp}:8081`;
  }
  
  try {
    peerConnection = new RTCPeerConnection(getIceConfiguration());
    
    screenChannel = peerConnection.createDataChannel("screen");
    inputChannel = peerConnection.createDataChannel("input");
    fileChannel = peerConnection.createDataChannel("file");
    setupFileChannelHandlers(fileChannel);
    setupClientInputChannelHandlers(inputChannel);
    peerConnection.addTransceiver("video", { direction: "recvonly" });
    
    screenChannel.onopen = () => {
      console.log("Direct P2P Screen data channel opened");
    };
    
    const iceGatheringPromise = new Promise((resolve) => {
      if (peerConnection.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (peerConnection.iceGatheringState === "complete") {
            peerConnection.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        peerConnection.addEventListener("icegatheringstatechange", checkState);
        setTimeout(resolve, 3000); // 3 seconds timeout safeguard
      }
    });
    
    const offer = await peerConnection.createOffer();
    const optimizedOffer = {
      type: offer.type,
      sdp: optimizeSdp(offer.sdp)
    };
    await peerConnection.setLocalDescription(optimizedOffer);
    
    await iceGatheringPromise;
    
    const localSdp = peerConnection.localDescription;
    const targetUrl = `http://${targetIp}/pair`;
    console.log(`Sending direct pairing request to: ${targetUrl}`);
    
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code: savedHostCode,
        clientId: savedClientId,
        sdp: localSdp
      })
    });
    
    if (response.status === 403) {
      throw new Error("Connection pairing code rejected or declined by host.");
    } else if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const resData = await response.json();
    if (!resData.sdp) {
      throw new Error("No answer SDP returned from host.");
    }
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription({
      type: "answer",
      sdp: resData.sdp
    }));
    
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log("Direct client connection state:", state);
      const screenState = screenChannel ? screenChannel.readyState : "null";
      const inputState = inputChannel ? inputChannel.readyState : "null";
      remoteHostInfo.textContent = `Direct Conn: ${state} | ScreenDC: ${screenState} | InputDC: ${inputState}`;
      
      if (state === "connected") {
        isReconnecting = false;
        const overlay = document.getElementById("reconnection-overlay");
        if (overlay) {
          overlay.style.display = "none";
        }
        showScreen(viewRemoteView);
        remoteScreenVideo.focus();
        saveRecentConnection(savedHostCode, hostIp);
        keepWebviewAlive();
        startHudDiagnostics();
        startClientClipboardSync();
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        triggerReconnectionFlow();
      }
    };
    
    peerConnection.ontrack = (event) => {
      handleIncomingTrack(event);
    };
    
  } catch (err) {
    console.error("Direct connection error:", err);
    clientError.textContent = `Direct connection failed: ${err.message}`;
    clientError.style.display = "block";
    btnClientConnect.textContent = "Connect";
    btnClientConnect.disabled = false;
    cleanupWebRTC();
  }
}

function handleClientDisconnect(errMsg) {
  console.log("Client disconnected:", errMsg);
  // Show the error and let the user retry manually.
  // Auto-reconnect is intentionally removed: it was causing the host
  // accept/reject dialog to re-appear in a loop, confusing both users.
  if (activeRole === "client") {
    clientError.textContent = errMsg;
    clientError.style.display = "block";
    btnClientConnect.textContent = "Connect";
    btnClientConnect.disabled = false;
    resetSession();
  }
}

function optimizeSdp(sdp) {
  let lines = sdp.split('\r\n');
  const videoLineIndex = lines.findIndex(line => line.startsWith('m=video'));
  if (videoLineIndex !== -1) {
    const parts = lines[videoLineIndex].split(' ');
    const proto = parts[2];
    const payloads = parts.slice(3);
    
    let h264Payloads = [];
    let otherPayloads = [];
    
    payloads.forEach(payload => {
      const rtpmapLine = lines.find(line => line.startsWith(`a=rtpmap:${payload} H264/`));
      if (rtpmapLine) {
        h264Payloads.push(payload);
      } else {
        otherPayloads.push(payload);
      }
    });
    
    if (h264Payloads.length > 0) {
      const newPayloadOrder = [...h264Payloads, ...otherPayloads];
      lines[videoLineIndex] = `m=video ${parts[1]} ${proto} ${newPayloadOrder.join(' ')}`;
      console.log("Low-latency SDP: Prioritized H.264 codec payload types:", h264Payloads);
    }
  }
  return lines.join('\r\n');
}

async function handleOfferSignal(senderId, clientSdp, onAcceptAnswer, onDecline) {
  securityRequestMessage.textContent = `Device ${senderId} wants to view and control your desktop. Do you accept this request?`;
  securityDialog.classList.add("open");
  
  btnSecurityAccept.onclick = async () => {
    securityDialog.classList.remove("open");
    try {
      setupHostPeerConnection(senderId);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(clientSdp));
      const usingVideoTrack = await startHostScreenShare(senderId);
      
      // Prevent background webview throttling on host
      keepWebviewAlive();
      
      const answer = await peerConnection.createAnswer();
      const optimizedAnswer = {
        type: answer.type,
        sdp: optimizeSdp(answer.sdp)
      };
      await peerConnection.setLocalDescription(optimizedAnswer);
      
      onAcceptAnswer(optimizedAnswer, usingVideoTrack);
      
      // Flush buffered ICE candidates that arrived before acceptance.
      console.log(`Flushing ${iceCandidateBuffer.length} buffered ICE candidates`);
      for (const candidate of iceCandidateBuffer) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("Failed to add buffered ICE candidate:", e);
        }
      }
      iceCandidateBuffer = [];
    } catch (acceptErr) {
      console.error("Failed to accept remote viewer:", acceptErr);
      hostStatusText.textContent = `Screen share failed: ${acceptErr}`;
      hostStatusDot.className = "status-dot red";
      cleanupWebRTC();
    }
  };
  
  btnSecurityDecline.onclick = () => {
    securityDialog.classList.remove("open");
    iceCandidateBuffer = []; // discard buffered candidates on decline
    onDecline();
    cleanupWebRTC();
    resetSession();
  };
}

async function setupClientPeerConnection(targetHostCode, localClientId) {
  peerConnection = new RTCPeerConnection(getIceConfiguration());
  
  peerConnection.onicecandidate = (e) => {
    if (e.candidate && sigWs && sigWs.readyState === WebSocket.OPEN) {
      sigWs.send(JSON.stringify({
        type: 'signal',
        target: targetHostCode,
        data: { candidate: e.candidate }
      }));
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.log("Client connection state change:", state);
    const screenState = screenChannel ? screenChannel.readyState : "null";
    const inputState = inputChannel ? inputChannel.readyState : "null";
    remoteHostInfo.textContent = `Conn: ${state} | ScreenDC: ${screenState} | InputDC: ${inputState}`;
    
    if (state === "connected") {
      isReconnecting = false;
      const overlay = document.getElementById("reconnection-overlay");
      if (overlay) {
        overlay.style.display = "none";
      }
      showScreen(viewRemoteView);
      remoteScreenVideo.focus();
      reconnectAttempts = 0;
      
      // Save recent connection to storage
      saveRecentConnection(targetHostCode, inputClientSigUrl.value);
      
      // Prevent background webview throttling on client
      keepWebviewAlive();
      
      // Start WebRTC connection HUD poller
      startHudDiagnostics();
      
      // Start Client Clipboard Sync
      startClientClipboardSync();
    } else if (state === "disconnected" || state === "failed" || state === "closed") {
      triggerReconnectionFlow();
    }
  };

  peerConnection.ontrack = (event) => {
    handleIncomingTrack(event);
  };

  // Create data channels
  screenChannel = peerConnection.createDataChannel("screen");
  inputChannel = peerConnection.createDataChannel("input");
  fileChannel = peerConnection.createDataChannel("file");
  setupFileChannelHandlers(fileChannel);
  setupClientInputChannelHandlers(inputChannel);
  peerConnection.addTransceiver("video", { direction: "recvonly" });
  
  screenChannel.onopen = () => {
    console.log("Screen data channel opened on client side — waiting for frames");
    remoteHostInfo.textContent = `Viewing Host: ${formatConnectionCode(targetHostCode)} | Channel open, waiting for frames...`;
  };
  screenChannel.onerror = (err) => {
    console.error("Client screen channel error:", err);
  };
  let framesReceived = 0;
  screenChannel.onmessage = (e) => {
    framesReceived++;
    remoteScreenVideo.classList.add("fallback-hidden");
    remoteScreenImg.classList.add("fallback-active");
    remoteScreenImg.src = "data:image/jpeg;base64," + e.data;
    if (framesReceived % 30 === 0) {
      remoteHostInfo.textContent = `Viewing Host: ${formatConnectionCode(targetHostCode)} | ${framesReceived} frames received`;
    }
  };
  
  // Generate Offer
  const offer = await peerConnection.createOffer();
  const optimizedOffer = {
    type: offer.type,
    sdp: optimizeSdp(offer.sdp)
  };
  await peerConnection.setLocalDescription(optimizedOffer);
  
  sigWs.send(JSON.stringify({
    type: 'signal',
    target: targetHostCode,
    data: { sdp: optimizedOffer }
  }));
}

function startClientClipboardSync() {
  window.onfocus = async () => {
    if (activeRole === "client" && inputChannel && inputChannel.readyState === "open") {
      try {
        const text = await invoke("read_clipboard");
        if (text && text !== lastSentClipboardText) {
          lastSentClipboardText = text;
          inputChannel.send(JSON.stringify({ type: "clipboard", text }));
          console.log("Synced client clipboard update to remote host");
        }
      } catch (e) {
        console.error("Client clipboard sync error:", e);
      }
    }
  };
}

btnClientDisconnect.addEventListener("click", () => {
  resetSession();
  btnClientConnect.textContent = "Connect";
  btnClientConnect.disabled = false;
});

// ----------------------------------------------------
// 3. INPUT INTERCEPTIONS (CLIENT SIDE)
// ----------------------------------------------------
function getNormalizedCoordinates(e) {
  const target = e.currentTarget || e.target;
  const rect = target.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const display = target === remoteScreenVideoSecondary ? 1 : 0;
  
  return {
    x: Math.max(0.0, Math.min(1.0, x)),
    y: Math.max(0.0, Math.min(1.0, y)),
    display
  };
}

function handleMouseMove(e) {
  if (viewRemoteView.classList.contains("active") && inputChannel && inputChannel.readyState === "open") {
    let x, y, display = 0;
    const activeLock = document.pointerLockElement;
    
    if (activeLock && (activeLock === remoteScreenVideo || activeLock === remoteScreenVideoSecondary || activeLock === remoteScreenImg)) {
      const rect = activeLock.getBoundingClientRect();
      virtualMouseX += e.movementX / rect.width;
      virtualMouseY += e.movementY / rect.height;
      
      virtualMouseX = Math.max(0.0, Math.min(1.0, virtualMouseX));
      virtualMouseY = Math.max(0.0, Math.min(1.0, virtualMouseY));
      
      x = virtualMouseX;
      y = virtualMouseY;
      display = activeLock === remoteScreenVideoSecondary ? 1 : 0;
    } else {
      const coords = getNormalizedCoordinates(e);
      x = coords.x;
      y = coords.y;
      display = coords.display;
      
      virtualMouseX = x;
      virtualMouseY = y;
    }
    
    inputChannel.send(JSON.stringify({ type: "move", x, y, display }));
    
    // Position local cursor echo overlay inside viewport
    const container = document.getElementById("viewport-container");
    if (container && localCursorEcho) {
      const containerRect = container.getBoundingClientRect();
      let localX, localY;
      
      const target = activeLock || e.currentTarget || e.target;
      if (document.pointerLockElement === target) {
        const rect = target.getBoundingClientRect();
        localX = rect.left - containerRect.left + (virtualMouseX * rect.width);
        localY = rect.top - containerRect.top + (virtualMouseY * rect.height);
      } else {
        localX = e.clientX - containerRect.left;
        localY = e.clientY - containerRect.top;
      }
      
      localCursorEcho.style.left = `${localX}px`;
      localCursorEcho.style.top = `${localY}px`;
      localCursorEcho.style.display = "block";
    }
  }
}

function requestPointerLockOnViewport(e) {
  const target = e.currentTarget || e.target;
  if (document.pointerLockElement !== target) {
    target.requestPointerLock().catch(err => {
      console.warn("Pointer lock request failed:", err);
    });
  }
}

remoteScreenVideo.addEventListener("click", requestPointerLockOnViewport);
remoteScreenVideoSecondary.addEventListener("click", requestPointerLockOnViewport);
remoteScreenImg.addEventListener("click", requestPointerLockOnViewport);

remoteScreenVideo.addEventListener("mousemove", handleMouseMove);
remoteScreenVideoSecondary.addEventListener("mousemove", handleMouseMove);
remoteScreenImg.addEventListener("mousemove", handleMouseMove);

remoteScreenVideo.addEventListener("mouseleave", () => {
  if (document.pointerLockElement === null && localCursorEcho) localCursorEcho.style.display = "none";
});
remoteScreenVideoSecondary.addEventListener("mouseleave", () => {
  if (document.pointerLockElement === null && localCursorEcho) localCursorEcho.style.display = "none";
});
remoteScreenImg.addEventListener("mouseleave", () => {
  if (document.pointerLockElement === null && localCursorEcho) localCursorEcho.style.display = "none";
});

function handleMouseClick(e, isDown) {
  if (viewRemoteView.classList.contains("active") && inputChannel && inputChannel.readyState === "open") {
    e.preventDefault();
    const { x, y, display } = getNormalizedCoordinates(e);
    
    let btn = 0;
    if (e.button === 2) {
      btn = 1; // Right Click
    } else if (e.button === 1) {
      btn = 2; // Middle Click
    }
    
    inputChannel.send(JSON.stringify({
      type: "click",
      button: btn,
      down: isDown,
      x,
      y,
      display
    }));
  }
}

remoteScreenVideo.addEventListener("mousedown", (e) => handleMouseClick(e, true));
remoteScreenVideo.addEventListener("mouseup", (e) => handleMouseClick(e, false));
remoteScreenVideoSecondary.addEventListener("mousedown", (e) => handleMouseClick(e, true));
remoteScreenVideoSecondary.addEventListener("mouseup", (e) => handleMouseClick(e, false));
remoteScreenImg.addEventListener("mousedown", (e) => handleMouseClick(e, true));
remoteScreenImg.addEventListener("mouseup", (e) => handleMouseClick(e, false));

remoteScreenVideo.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});
remoteScreenVideoSecondary.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});
remoteScreenImg.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

function handleKeyEvent(e, isDown) {
  const isPointerLocked = document.pointerLockElement === remoteScreenVideo || document.pointerLockElement === remoteScreenImg;
  const screenFocused = isPointerLocked || document.activeElement === remoteScreenVideo || document.activeElement === remoteScreenImg;
  if (screenFocused && inputChannel && inputChannel.readyState === "open") {
    if (isPointerLocked || e.key === "Tab" || e.key === "Escape" || e.key === "Alt") {
      e.preventDefault();
    }
    inputChannel.send(JSON.stringify({
      type: "key",
      keycode: e.keyCode,
      down: isDown
    }));
  }
}

window.addEventListener("keydown", (e) => handleKeyEvent(e, true));
window.addEventListener("keyup", (e) => handleKeyEvent(e, false));

// Intercept system shortcuts via Keyboard Lock API when viewport is in pointer lock
document.addEventListener("pointerlockchange", async () => {
  const isLocked = document.pointerLockElement === remoteScreenVideo || document.pointerLockElement === remoteScreenImg;
  if (isLocked) {
    invoke("set_keyboard_hook_active", { active: true }).catch(console.error);
    if (navigator.keyboard && navigator.keyboard.lock) {
      try {
        await navigator.keyboard.lock(["Escape", "Tab", "AltGraph", "MetaLeft", "MetaRight"]);
        console.log("Keyboard lock engaged for system hotkeys");
      } catch (err) {
        console.warn("Failed to engage keyboard lock:", err);
      }
    }
  } else {
    invoke("set_keyboard_hook_active", { active: false }).catch(console.error);
    if (navigator.keyboard && navigator.keyboard.unlock) {
      navigator.keyboard.unlock();
      console.log("Keyboard lock released");
    }
  }
});

// ----------------------------------------------------
// AUTO-UPDATER
// ----------------------------------------------------
async function checkForUpdatesSilently() {
  try {
    const update = await invoke("check_for_update");
    if (update && update.update_available) {
      showUpdateDialog(update);
    }
  } catch (e) {
    console.error("Auto-updater failed checking for updates:", e);
  }
}

function showUpdateDialog(update) {
  updateTitle.textContent = `Update Available: ${update.latest_version}`;
  updateDetails.textContent = `Current Version: ${update.current_version}\n\nRelease Notes:\n${update.notes || "No release notes available."}`;
  
  updateDialog.classList.add("open");
  
  btnUpdateDecline.onclick = () => {
    updateDialog.classList.remove("open");
  };
  
  btnUpdateAccept.onclick = async () => {
    // Show download progress
    updateButtonRow.style.display = "none";
    updateProgressContainer.style.display = "block";
    updateProgressBar.style.width = "0%";
    updateProgressLabel.textContent = "Downloading installer...";
    
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 95) progress = 95;
      updateProgressBar.style.width = `${Math.floor(progress)}%`;
    }, 400);
    
    try {
      await invoke("apply_update", {
        downloadUrl: update.download_url,
        assetName: update.asset_name
      });
      clearInterval(progressInterval);
      updateProgressBar.style.width = "100%";
      updateProgressLabel.textContent = "Launching installer...";
      
      setTimeout(() => {
        updateDialog.classList.remove("open");
        updateButtonRow.style.display = "flex";
        updateProgressContainer.style.display = "none";
      }, 2000);
    } catch (e) {
      clearInterval(progressInterval);
      console.error("Failed to install update:", e);
      updateProgressLabel.textContent = "Download failed: " + e.toString();
      updateProgressLabel.style.color = "#d32f2f";
      
      setTimeout(() => {
        updateDialog.classList.remove("open");
        updateButtonRow.style.display = "flex";
        updateProgressContainer.style.display = "none";
        updateProgressLabel.style.color = "var(--body-strong)";
      }, 5000);
    }
  };
}

// ----------------------------------------------------
// RECENT CONNECTIONS (SESSION HISTORY)
// ----------------------------------------------------
function saveRecentConnection(code, hostIp) {
  if (!code) return;
  let list = [];
  try {
    const stored = localStorage.getItem("linkup_recent_connections");
    if (stored) list = JSON.parse(stored);
  } catch (e) {
    console.error("Error parsing recent connections", e);
  }
  
  // Remove if duplicate exists
  list = list.filter(item => item.code !== code);
  
  // Add new connection at start
  list.unshift({
    code: code,
    hostIp: hostIp || "",
    timestamp: Date.now()
  });
  
  // Limit to 5 entries
  if (list.length > 5) list = list.slice(0, 5);
  
  localStorage.setItem("linkup_recent_connections", JSON.stringify(list));
  renderRecentConnections();
}

function renderRecentConnections() {
  let list = [];
  try {
    const stored = localStorage.getItem("linkup_recent_connections");
    if (stored) list = JSON.parse(stored);
  } catch (e) {}
  
  if (!recentSessionsContainer || !recentListItems) return;
  
  if (list.length === 0) {
    recentSessionsContainer.style.display = "none";
    return;
  }
  
  recentSessionsContainer.style.display = "block";
  recentListItems.innerHTML = "";
  
  list.forEach(item => {
    const div = document.createElement("div");
    div.className = "recent-item";
    
    const timeStr = getRelativeTimeString(item.timestamp);
    const displayCode = formatConnectionCode(item.code);
    
    div.innerHTML = `
      <div class="recent-item-info">
        <span class="recent-item-code">${displayCode}</span>
        <span class="recent-item-url">${item.hostIp || "Default server"}</span>
      </div>
      <span class="recent-item-date">${timeStr}</span>
    `;
    
    div.addEventListener("click", () => {
      inputHostCode.value = item.code;
      inputHostCode.dispatchEvent(new Event("input"));
      inputClientSigUrl.value = item.hostIp;
    });
    
    recentListItems.appendChild(div);
  });
}

function getRelativeTimeString(ts) {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  
  if (secs < 60) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ----------------------------------------------------
// LATENCY & NETWORK HUD DIAGNOSTICS
// ----------------------------------------------------
function startHudDiagnostics() {
  if (hudInterval) clearInterval(hudInterval);
  
  prevBytesReceived = 0;
  prevFramesDecoded = 0;
  prevTimestamp = Date.now();
  
  hudInterval = setInterval(async () => {
    if (!peerConnection || peerConnection.connectionState !== "connected") {
      clearInterval(hudInterval);
      return;
    }
    
    try {
      const stats = await peerConnection.getStats();
      let activeCandidatePair = null;
      let inboundVideoStat = null;
      
      stats.forEach(report => {
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          activeCandidatePair = report;
        } else if (report.type === "inbound-rtp" && report.kind === "video") {
          inboundVideoStat = report;
        }
      });
      
      const now = Date.now();
      const elapsed = (now - prevTimestamp) / 1000; // in seconds
      prevTimestamp = now;
      
      // 1. Connection Type
      let connType = "P2P";
      if (activeCandidatePair) {
        const localCandidate = stats.get(activeCandidatePair.localCandidateId);
        const remoteCandidate = stats.get(activeCandidatePair.remoteCandidateId);
        if (localCandidate && (localCandidate.candidateType === "relay" || (remoteCandidate && remoteCandidate.candidateType === "relay"))) {
          connType = "Relay (TURN)";
        }
      }
      if (hudType) hudType.textContent = connType;
      
      // 2. Latency (Ping)
      let ping = 0;
      if (activeCandidatePair && activeCandidatePair.currentRoundTripTime !== undefined) {
        ping = Math.round(activeCandidatePair.currentRoundTripTime * 1000);
        if (hudPing) hudPing.textContent = `${ping} ms`;
      } else {
        if (hudPing) hudPing.textContent = "-- ms";
      }
      
      // Congestion control quality & framerate adaptation based on latency
      if (ping > 0) {
        let quality = 78;
        let sleepMs = 33; // 30fps ideal
        
        if (ping > 250) {
          quality = 25;
          sleepMs = 160; // 6fps
        } else if (ping > 150) {
          quality = 40;
          sleepMs = 66;  // 15fps
        } else if (ping > 80) {
          quality = 60;
          sleepMs = 50;  // 20fps
        }
        
        // Signal host to adapt quality
        if (inputChannel && inputChannel.readyState === "open") {
          inputChannel.send(JSON.stringify({
            type: "adapt-quality",
            quality: quality,
            sleepMs: sleepMs
          }));
        }
      }
      
      if (inboundVideoStat) {
        // 3. Resolution
        if (inboundVideoStat.frameWidth && inboundVideoStat.frameHeight) {
          if (hudRes) hudRes.textContent = `${inboundVideoStat.frameWidth}x${inboundVideoStat.frameHeight}`;
        } else {
          if (hudRes) hudRes.textContent = "--x--";
        }
        
        // 4. FPS
        if (inboundVideoStat.framesDecoded !== undefined) {
          const fps = Math.round((inboundVideoStat.framesDecoded - prevFramesDecoded) / elapsed);
          prevFramesDecoded = inboundVideoStat.framesDecoded;
          if (hudFps) hudFps.textContent = `${fps} fps`;
        } else {
          if (hudFps) hudFps.textContent = "-- fps";
        }
        
        // 5. Bitrate
        if (inboundVideoStat.bytesReceived !== undefined) {
          const rate = ((inboundVideoStat.bytesReceived - prevBytesReceived) * 8) / (1000000 * elapsed); // in Mbps
          prevBytesReceived = inboundVideoStat.bytesReceived;
          if (hudRate) hudRate.textContent = `${rate.toFixed(2)} Mbps`;
        } else {
          if (hudRate) hudRate.textContent = "-- Mbps";
        }
      }
    } catch (err) {
      console.error("Error reading connection stats HUD:", err);
    }
  }, 2000);
}

// ----------------------------------------------------
// WEBRTC FILE TRANSFER CHANNEL
// ----------------------------------------------------
function setupFileChannelHandlers(channel) {
  channel.binaryType = "arraybuffer";
  
  channel.onmessage = (event) => {
    if (typeof event.data === "string") {
      const msg = JSON.parse(event.data);
      if (msg.type === "file-meta") {
        receivedChunks = [];
        incomingFileInfo = { name: msg.name, size: msg.size };
        showFileProgressOverlay(msg.name, "Receiving...", 0);
      } else if (msg.type === "file-eof") {
        const blob = new Blob(receivedChunks);
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = incomingFileInfo.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showFileProgressOverlay(incomingFileInfo.name, "Complete", 100);
        setTimeout(() => {
          hideFileProgressOverlay();
          incomingFileInfo = null;
          receivedChunks = [];
        }, 1500);
      }
    } else {
      // Binary chunk received
      receivedChunks.push(event.data);
      
      const currentBytes = receivedChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      if (incomingFileInfo) {
        const progress = Math.round((currentBytes / incomingFileInfo.size) * 100);
        updateFileProgressOverlay(progress);
      }
    }
  };
}

function setupClientInputChannelHandlers(channel) {
  channel.onopen = () => {
    console.log("Client input channel opened. Starting heartbeat ping loop.");
    lastHeartbeatTime = Date.now();
    isReconnecting = false;
    
    // Hide overlay on open
    const overlay = document.getElementById("reconnection-overlay");
    if (overlay) {
      overlay.style.display = "none";
    }
    
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(() => {
      if (channel.readyState === "open") {
        channel.send(JSON.stringify({ type: "ping" }));
      }
      
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeatTime;
      if (timeSinceLastHeartbeat > 6000) { // 6 seconds timeout (3 missed heartbeats)
        console.warn(`Heartbeat timeout. Last received ${timeSinceLastHeartbeat}ms ago.`);
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        triggerReconnectionFlow();
      }
    }, 2000);
  };
  
  channel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "pong") {
        lastHeartbeatTime = Date.now();
      } else if (data.type === "clipboard") {
        if (checkAllowClipboard && !checkAllowClipboard.checked) return;
        // Sync clipboard from Host to Client natively
        invoke("write_clipboard", { text: data.text }).catch(console.error);
        lastSentClipboardText = data.text; // Prevent echo loop
      }
    } catch (e) {
      console.warn("Error parsing inputChannel message:", e);
    }
  };
  
  channel.onclose = () => {
    console.log("Client input channel closed.");
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };
}

function triggerReconnectionFlow() {
  if (isReconnecting) return;
  isReconnecting = true;
  reconnectAttempts = 0;
  
  // Show reconnection overlay
  showReconnectionOverlay();
  
  attemptReconnection();
}

function showReconnectionOverlay() {
  let overlay = document.getElementById("reconnection-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "reconnection-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(28, 28, 28, 0.85)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.color = "#fcfbf8";
    overlay.style.fontFamily = "var(--font-display)";
    
    overlay.innerHTML = `
      <div style="text-align: center; max-width: 400px; padding: 32px; background: #f7f4ed; color: #1c1c1c; border-radius: 16px; border: 1px solid #eceae4; box-shadow: rgba(0,0,0,0.15) 0px 10px 30px;">
        <div style="font-size: 24px; font-weight: 500; margin-bottom: 12px;">Connection Interrupted</div>
        <p id="reconnection-status-text" style="font-size: 15px; color: var(--body); line-height: 1.6; margin: 0 0 24px 0;">Attempting to restore session...</p>
        <div style="display: flex; justify-content: center; gap: 12px;">
          <button class="btn btn-secondary" id="btn-reconnect-cancel" style="padding: 8px 16px; font-size: 14px;">Cancel</button>
          <button class="btn" id="btn-reconnect-now" style="padding: 8px 16px; font-size: 14px; background: #1c1c1c; color: #fcfbf8;">Retry Now</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById("btn-reconnect-cancel").onclick = () => {
      cancelReconnection();
    };
    document.getElementById("btn-reconnect-now").onclick = () => {
      attemptReconnection();
    };
  }
  overlay.style.display = "flex";
  document.getElementById("reconnection-status-text").textContent = "Attempting to restore session...";
}

function cancelReconnection() {
  isReconnecting = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const overlay = document.getElementById("reconnection-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  cleanupWebRTC();
  resetSession();
  showScreen(viewSelection);
}

async function attemptReconnection() {
  if (!isReconnecting) return;
  
  reconnectAttempts++;
  const statusText = document.getElementById("reconnection-status-text");
  if (statusText) {
    statusText.textContent = `Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;
  }
  
  console.log(`Reconnection attempt ${reconnectAttempts} of ${MAX_RECONNECT_ATTEMPTS}`);
  
  try {
    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (e) {}
      peerConnection = null;
    }
    
    const inputIp = inputClientSigUrl.value.trim();
    const isDirect = inputIp && !inputIp.startsWith("ws://") && !inputIp.startsWith("wss://");
    
    if (isDirect) {
      console.log("Reconnecting via direct LDSH...");
      await reconnectDirectClient();
    } else {
      console.log("Reconnecting via WebSocket signaling server...");
      if (!sigWs || sigWs.readyState !== WebSocket.OPEN) {
        const sigUrl = inputSigUrl.value.trim() || "ws://localhost:8080";
        sigWs = new WebSocket(sigUrl);
        sigWs.onopen = () => {
          sigWs.send(JSON.stringify({ type: 'register', id: savedClientId }));
        };
        sigWs.onmessage = async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'registered') {
            setupClientPeerConnection(savedHostCode, savedClientId);
          } else if (msg.type === 'signal') {
            const data = msg.data;
            if (data.rejected) {
              throw new Error("Connection declined by host.");
            } else if (data.sdp) {
              await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            } else if (data.candidate) {
              await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
          }
        };
        sigWs.onerror = (e) => {
          throw new Error("Signaling connection failed.");
        };
      } else {
        setupClientPeerConnection(savedHostCode, savedClientId);
      }
    }
  } catch (err) {
    console.warn(`Reconnection attempt ${reconnectAttempts} failed:`, err);
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectTimer = setTimeout(attemptReconnection, 3000);
    } else {
      const statusText = document.getElementById("reconnection-status-text");
      if (statusText) {
        statusText.textContent = "Reconnection failed. Session closed.";
      }
      setTimeout(cancelReconnection, 2000);
    }
  }
}

async function reconnectDirectClient() {
  let targetIp = inputClientSigUrl.value.trim();
  if (!targetIp.includes(":")) {
    targetIp = `${targetIp}:8081`;
  }
  
  peerConnection = new RTCPeerConnection(getIceConfiguration());
  
  screenChannel = peerConnection.createDataChannel("screen");
  inputChannel = peerConnection.createDataChannel("input");
  fileChannel = peerConnection.createDataChannel("file");
  setupFileChannelHandlers(fileChannel);
  peerConnection.addTransceiver("video", { direction: "recvonly" });
  
  setupClientInputChannelHandlers(inputChannel);
  
  const iceGatheringPromise = new Promise((resolve) => {
    if (peerConnection.iceGatheringState === "complete") {
      resolve();
    } else {
      const checkState = () => {
        if (peerConnection.iceGatheringState === "complete") {
          peerConnection.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      };
      peerConnection.addEventListener("icegatheringstatechange", checkState);
      setTimeout(resolve, 3000);
    }
  });
  
  const offer = await peerConnection.createOffer();
  const optimizedOffer = {
    type: offer.type,
    sdp: optimizeSdp(offer.sdp)
  };
  await peerConnection.setLocalDescription(optimizedOffer);
  
  await iceGatheringPromise;
  
  const localSdp = peerConnection.localDescription;
  const targetUrl = `http://${targetIp}/pair`;
  
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: savedHostCode,
      clientId: savedClientId,
      sdp: localSdp
    })
  });
  
  if (response.status === 403) {
    throw new Error("Connection code rejected or declined by host.");
  } else if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  
  const resData = await response.json();
  if (!resData.sdp) {
    throw new Error("No answer SDP returned.");
  }
  
  await peerConnection.setRemoteDescription(new RTCSessionDescription({
    type: "answer",
    sdp: resData.sdp
  }));
  
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.log("Direct client reconnection state:", state);
    if (state === "connected") {
      console.log("Direct client reconnected successfully!");
      isReconnecting = false;
      const overlay = document.getElementById("reconnection-overlay");
      if (overlay) {
        overlay.style.display = "none";
      }
      startHudDiagnostics();
      startClientClipboardSync();
    } else if (state === "disconnected" || state === "failed" || state === "closed") {
      triggerReconnectionFlow();
    }
  };
  
  peerConnection.ontrack = (event) => {
    handleIncomingTrack(event);
  };
}

function triggerFileSend(file) {
  if (!fileChannel || fileChannel.readyState !== "open") {
    alert("P2P file transfer channel is not open yet.");
    return;
  }
  
  showFileProgressOverlay(file.name, "Sending...", 0);
  
  // Send file metadata
  fileChannel.send(JSON.stringify({
    type: "file-meta",
    name: file.name,
    size: file.size
  }));
  
  const CHUNK_SIZE = 65536; // 64KB chunks
  let offset = 0;
  const fileReader = new FileReader();
  
  // Set threshold to 256KB for backpressure buffering
  fileChannel.bufferedAmountLowThreshold = 262144;
  
  fileChannel.onbufferedamountlow = () => {
    readNext();
  };
  
  const readSlice = (o) => {
    const slice = file.slice(o, o + CHUNK_SIZE);
    fileReader.readAsArrayBuffer(slice);
  };
  
  fileReader.onload = (e) => {
    const buffer = e.target.result;
    fileChannel.send(buffer);
    
    offset += buffer.byteLength;
    const progress = Math.round((offset / file.size) * 100);
    updateFileProgressOverlay(progress);
    
    if (offset < file.size) {
      if (fileChannel.bufferedAmount > fileChannel.bufferedAmountLowThreshold) {
        // Pause reading and wait for onbufferedamountlow event to fire
        return;
      }
      readNext();
    } else {
      // Done - send EOF
      fileChannel.send(JSON.stringify({ type: "file-eof" }));
      showFileProgressOverlay(file.name, "Complete", 100);
      setTimeout(() => {
        hideFileProgressOverlay();
      }, 1500);
    }
  };
  
  const readNext = () => {
    if (offset < file.size) {
      readSlice(offset);
    }
  };
  
  readNext();
}

function showFileProgressOverlay(name, status, percent) {
  if (!fileProgressHud) return;
  fileProgressHud.style.display = "flex";
  fileProgressName.textContent = name;
  fileProgressStatus.textContent = status;
  fileProgressPercent.textContent = `${percent}%`;
  fileProgressBar.style.width = `${percent}%`;
}

function updateFileProgressOverlay(percent) {
  if (!fileProgressPercent || !fileProgressBar) return;
  fileProgressPercent.textContent = `${percent}%`;
  fileProgressBar.style.width = `${percent}%`;
}

function hideFileProgressOverlay() {
  if (fileProgressHud) fileProgressHud.style.display = "none";
}

// ----------------------------------------------------
// WEB VIEW BACKGROUND KEEP ALIVE
// ----------------------------------------------------
let silentAudioInterval = null;
let audioContext = null;

function keepWebviewAlive() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    
    const playSilence = () => {
      if (!audioContext || audioContext.state === "closed") return;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
    };
    
    playSilence();
    silentAudioInterval = setInterval(playSilence, 1500);
    console.log("Silent audio loop started to prevent background throttling.");
  } catch (e) {
    console.warn("Could not start silent audio loop:", e);
  }
}

function stopKeepWebviewAlive() {
  if (silentAudioInterval) {
    clearInterval(silentAudioInterval);
    silentAudioInterval = null;
  }
  if (audioContext) {
    try { audioContext.close(); } catch(e){}
    audioContext = null;
  }
}

// ----------------------------------------------------
// MULTI-MONITOR VIEWPORT LOGIC
// ----------------------------------------------------
function handleIncomingTrack(event) {
  const [stream] = event.streams;
  const track = event.track;
  console.log(`Received incoming remote track: id=${track.id}, kind=${track.kind}`);
  
  if (track.kind === "video") {
    const targetStream = stream || new MediaStream([track]);
    
    // Add to remoteStreams tracking if not already present
    if (!remoteStreams.some(s => s.id === targetStream.id)) {
      remoteStreams.push(targetStream);
    }
    
    // Assign stream to corresponding video element
    if (remoteStreams.length === 1) {
      remoteScreenVideo.srcObject = remoteStreams[0];
      remoteScreenVideo.muted = false;
      remoteScreenVideo.classList.remove("fallback-hidden");
      remoteScreenImg.classList.remove("fallback-active");
      
      floatingLayoutContainer.style.display = "none";
      const viewportContainer = document.getElementById("viewport-container");
      if (viewportContainer) {
        viewportContainer.className = "remote-viewport-container";
      }

      remoteScreenVideo.play().catch(e => console.warn("Primary video play failed:", e));
    } else if (remoteStreams.length > 1) {
      remoteScreenVideoSecondary.srcObject = remoteStreams[1];
      remoteScreenVideoSecondary.muted = false;
      remoteScreenVideoSecondary.classList.remove("fallback-hidden");
      
      // Show layout selection overlay controls
      floatingLayoutContainer.style.display = "flex";
      
      // Default to picture-in-picture layout
      selectRemoteLayout.value = "pip";
      updateRemoteViewportLayout();

      remoteScreenVideoSecondary.play().catch(e => console.warn("Secondary video play failed:", e));
    }

    // Update connection status label
    const targetHostCode = savedHostCode || "";
    if (remoteStreams.length > 1) {
      remoteHostInfo.textContent = `Viewing Host: ${formatConnectionCode(targetHostCode)} | Dual Monitor stream`;
    } else {
      remoteHostInfo.textContent = `Viewing Host: ${formatConnectionCode(targetHostCode)} | HD video stream`;
    }
  }
}

function updateRemoteViewportLayout() {
  const viewportContainer = document.getElementById("viewport-container");
  if (!viewportContainer) return;
  
  const layout = selectRemoteLayout.value;
  viewportContainer.className = "remote-viewport-container"; // reset classes
  
  if (layout === "side-by-side") {
    viewportContainer.classList.add("layout-side-by-side");
  } else if (layout === "pip") {
    viewportContainer.classList.add("layout-pip");
  } else if (layout === "single-1") {
    viewportContainer.classList.add("layout-single-1");
  } else if (layout === "single-2") {
    viewportContainer.classList.add("layout-single-2");
  }
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  discoverDisplays();
  
  // Render recent connections list
  renderRecentConnections();
  

  
  // Hook up file select buttons
  if (btnTransferFile) {
    btnTransferFile.addEventListener("click", () => {
      inputFileSelect.click();
    });
  }
  
  if (inputFileSelect) {
    inputFileSelect.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        triggerFileSend(file);
      }
    });
  }

  // Register direct-pairing-request listener
  listen("direct-pairing-request", (e) => {
    const { clientId, sdp } = e.payload;
    handleOfferSignal(
      clientId,
      sdp,
      (answer, usingVideoTrack) => {
        invoke("submit_direct_pairing_answer", { answer: answer.sdp }).catch(console.error);
        hostStatusText.textContent = `Direct local P2P link paired! Stream=${usingVideoTrack ? "video" : "compatibility"}`;
        hostStatusDot.className = "status-dot green";
      },
      () => {
        invoke("submit_direct_pairing_decline").catch(console.error);
      }
    );
  }).catch(console.error);

  // Listen to native keyboard events from Rust global hook
  listen("native-key-event", (e) => {
    const { keycode, down } = e.payload;
    if (viewRemoteView.classList.contains("active") && inputChannel && inputChannel.readyState === "open") {
      inputChannel.send(JSON.stringify({
        type: "key",
        keycode,
        down
      }));
    }
  }).catch(console.error);

  selectRemoteLayout.addEventListener("change", updateRemoteViewportLayout);

  btnClientFullscreen.addEventListener("click", () => {
    invoke("toggle_fullscreen").catch(console.error);
  });

  viewOnboarding.classList.remove("active");
  showScreen(viewSelection);

  // Check for updates silently on startup
  checkForUpdatesSilently();
});
