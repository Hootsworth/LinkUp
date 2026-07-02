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
const remoteScreenImg = document.getElementById("remote-screen-img");
const remoteHostInfo = document.getElementById("remote-host-info");

// Connection Settings Panel Elements
const btnToggleSettings = document.getElementById("btn-toggle-settings");
const settingsPanel = document.getElementById("settings-panel");
const btnSaveSettings = document.getElementById("btn-save-settings");
const inputSigUrl = document.getElementById("input-sig-url");
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

// WebRTC & Signaling state
let sigWs = null;
let peerConnection = null;
let screenChannel = null;
let inputChannel = null;
let localTauriFrameUnlisten = null;
let localScreenStream = null;
let activeRole = null; // 'host' or 'client'
let currentSlideIndex = 0;

// Polish State
let lastSentClipboardText = "";
let clipboardInterval = null;
let savedHostCode = null;
let savedClientId = null;
const MAX_SCREEN_BUFFER_BYTES = 4 * 1024 * 1024;

// ICE candidate buffer — holds candidates that arrive at the host before
// the user clicks Accept (before peerConnection is created).
let iceCandidateBuffer = [];

// ----------------------------------------------------
// CONNECTION INFRASTRUCTURE SETTINGS (localStorage)
// ----------------------------------------------------
function loadSettings() {
  const sigUrl = localStorage.getItem("linkup_sig_url") || "ws://localhost:8080";
  const turnUrl = localStorage.getItem("linkup_turn_url") || "";
  const turnUser = localStorage.getItem("linkup_turn_user") || "linkupuser";
  const turnPass = localStorage.getItem("linkup_turn_pass") || "linkuppassword";
  
  inputSigUrl.value = sigUrl;
  inputTurnUrl.value = turnUrl;
  inputTurnUser.value = turnUser;
  inputTurnPass.value = turnPass;
}

function saveSettings() {
  localStorage.setItem("linkup_sig_url", inputSigUrl.value.trim());
  localStorage.setItem("linkup_turn_url", inputTurnUrl.value.trim());
  localStorage.setItem("linkup_turn_user", inputTurnUser.value.trim());
  localStorage.setItem("linkup_turn_pass", inputTurnPass.value.trim());
}

// Generate dynamic ICE configuration based on settings
function getIceConfiguration() {
  const turnUrl = inputTurnUrl.value.trim();
  const turnUser = inputTurnUser.value.trim();
  const turnPass = inputTurnPass.value.trim();
  
  const servers = [
    { urls: "stun:stun.l.google.com:19302" } // Public Google STUN
  ];
  
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPass
    });
  }
  
  return { iceServers: servers };
}

// Toggle Settings Drawer
btnToggleSettings.addEventListener("click", () => {
  settingsPanel.classList.toggle("open");
});

btnSaveSettings.addEventListener("click", () => {
  saveSettings();
  settingsPanel.classList.remove("open");
  console.log("Settings saved.");
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
  [viewOnboarding, viewSelection, viewHosting, viewClientConfig, viewRemoteView].forEach(s => {
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
  
  if (localTauriFrameUnlisten) {
    localTauriFrameUnlisten();
    localTauriFrameUnlisten = null;
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
  if (peerConnection) {
    try { peerConnection.close(); } catch(e){}
    peerConnection = null;
  }
  if (sigWs) {
    try { sigWs.close(); } catch(e){}
    sigWs = null;
  }
  
  invoke("stop_host").catch(console.error);
  
  if (remoteScreenVideo.srcObject) {
    remoteScreenVideo.srcObject.getTracks().forEach(track => track.stop());
  }
  remoteScreenVideo.srcObject = null;
  remoteScreenVideo.classList.remove("fallback-hidden");
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

function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ----------------------------------------------------
// 1. HOST MODE
// ----------------------------------------------------
btnModeHost.addEventListener("click", () => {
  const code = generateSessionCode();
  const sigUrl = inputSigUrl.value.trim() || "ws://localhost:8080";
  
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
        localConnectionCode.textContent = msg.id.slice(0, 3) + " " + msg.id.slice(3);
        hostStatusText.textContent = "Waiting for connection code pairing...";
      }
      
      else if (msg.type === 'signal') {
        const senderId = msg.sender;
        const data = msg.data;
        
        if (data.sdp && data.sdp.type === "offer") {
          // SECURITY HANDSHAKE: Prompt user to accept/decline connection request
          securityRequestMessage.textContent = `Device ${senderId} wants to view and control your desktop. Do you accept this request?`;
          securityDialog.classList.add("open");
          
          btnSecurityAccept.onclick = async () => {
            securityDialog.classList.remove("open");
            try {
              setupHostPeerConnection(senderId);
              await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
              const usingVideoTrack = await startHostScreenShare(senderId);
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              sigWs.send(JSON.stringify({
                type: 'signal',
                target: senderId,
                data: { sdp: answer, mode: usingVideoTrack ? "video" : "jpeg-fallback" }
              }));
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
            sigWs.send(JSON.stringify({
              type: 'signal',
              target: senderId,
              data: { rejected: true }
            }));
            cleanupWebRTC();
            resetSession();
          };
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
      // Start Host Clipboard Poller
      startHostClipboardPoller();
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
        if (inputEvent.type === "move") {
          invoke("send_mouse_move", { x: inputEvent.x, y: inputEvent.y });
        } else if (inputEvent.type === "click") {
          invoke("send_mouse_click", {
            button: inputEvent.button,
            down: inputEvent.down,
            x: inputEvent.x,
            y: inputEvent.y
          });
        } else if (inputEvent.type === "key") {
          invoke("send_key_event", {
            keycode: inputEvent.keycode,
            down: inputEvent.down
          });
        } else if (inputEvent.type === "clipboard") {
          // Sync clipboard natively on Host
          invoke("write_clipboard", { text: inputEvent.text }).catch(console.error);
          lastSentClipboardText = inputEvent.text; // Prevent echo loop
        }
      };
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
      audio: false
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

    const sender = peerConnection.addTrack(videoTrack, localScreenStream);
    await tuneVideoSender(sender);
    hostStatusText.textContent = "Streaming screen as WebRTC video...";
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
  try {
    await invoke("start_host");
  } catch (captureErr) {
    throw new Error(`${captureErr}. Grant Screen Recording permission in System Settings.`);
  }

  let framesSent = 0;
  localTauriFrameUnlisten = await listen("local-frame", (e) => {
    if (screenChannel && screenChannel.readyState === "open" && screenChannel.bufferedAmount < MAX_SCREEN_BUFFER_BYTES) {
      try {
        screenChannel.send(e.payload);
        framesSent++;
        if (framesSent % 30 === 0) {
          hostStatusText.textContent = `Compatibility stream: ${framesSent} frames sent`;
        }
      } catch (sendErr) {
        console.warn("Frame send error:", sendErr);
      }
    }
  });
}

function startHostClipboardPoller() {
  if (clipboardInterval) clearInterval(clipboardInterval);
  clipboardInterval = setInterval(async () => {
    try {
      const text = await invoke("read_clipboard");
      if (text && text !== lastSentClipboardText) {
        lastSentClipboardText = text;
        if (inputChannel && inputChannel.readyState === "open") {
          inputChannel.send(JSON.stringify({ type: "clipboard", text }));
          console.log("Synced host clipboard update to remote client");
        }
      }
    } catch (e) {
      console.error("Clipboard polling error:", e);
    }
  }, 1500);
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
  const code = inputHostCode.value.trim();
  if (code.length !== 6 || isNaN(code)) {
    clientError.textContent = "Please enter a valid 6-digit connection code";
    clientError.style.display = "block";
    return;
  }
  
  savedHostCode = code;
  savedClientId = "client_" + generateSessionCode();
  connectClientViewer();
});

function connectClientViewer() {
  const inputIp = inputClientSigUrl.value.trim();
  let sigUrl = inputSigUrl.value.trim() || "ws://localhost:8080";
  
  if (inputIp) {
    if (!inputIp.startsWith("ws://") && !inputIp.startsWith("wss://")) {
      if (inputIp.includes(":")) {
        sigUrl = `ws://${inputIp}`;
      } else {
        sigUrl = `ws://${inputIp}:8080`;
      }
    } else {
      sigUrl = inputIp;
    }
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
      showScreen(viewRemoteView);
      remoteScreenVideo.focus();
      reconnectAttempts = 0;
      
      // Start Client Clipboard Sync
      startClientClipboardSync();
    } else if (state === "disconnected" || state === "failed" || state === "closed") {
      handleClientDisconnect("WebRTC peer connection drop");
    }
  };

  peerConnection.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) {
      remoteScreenVideo.srcObject = stream;
    } else {
      remoteScreenVideo.srcObject = new MediaStream([event.track]);
    }
    remoteScreenVideo.classList.remove("fallback-hidden");
    remoteScreenImg.classList.remove("fallback-active");
    remoteHostInfo.textContent = `Viewing Host: ${targetHostCode.slice(0, 3)} ${targetHostCode.slice(3)} | HD video stream`;
    remoteScreenVideo.play().catch((e) => console.warn("Unable to auto-play remote video:", e));
  };

  // Create data channels
  screenChannel = peerConnection.createDataChannel("screen");
  inputChannel = peerConnection.createDataChannel("input");
  peerConnection.addTransceiver("video", { direction: "recvonly" });
  
  screenChannel.onopen = () => {
    console.log("Screen data channel opened on client side — waiting for frames");
    remoteHostInfo.textContent = `Viewing Host: ${targetHostCode.slice(0, 3)} ${targetHostCode.slice(3)} | Channel open, waiting for frames...`;
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
      remoteHostInfo.textContent = `Viewing Host: ${targetHostCode.slice(0, 3)} ${targetHostCode.slice(3)} | ${framesReceived} frames received`;
    }
  };
  
  // Generate Offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  
  sigWs.send(JSON.stringify({
    type: 'signal',
    target: targetHostCode,
    data: { sdp: offer }
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
  const target = remoteScreenImg.classList.contains("fallback-active") ? remoteScreenImg : remoteScreenVideo;
  const rect = target.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  
  return {
    x: Math.max(0.0, Math.min(1.0, x)),
    y: Math.max(0.0, Math.min(1.0, y))
  };
}

function handleMouseMove(e) {
  if (viewRemoteView.classList.contains("active") && inputChannel && inputChannel.readyState === "open") {
    const { x, y } = getNormalizedCoordinates(e);
    inputChannel.send(JSON.stringify({ type: "move", x, y }));
  }
}

remoteScreenVideo.addEventListener("mousemove", handleMouseMove);
remoteScreenImg.addEventListener("mousemove", handleMouseMove);

function handleMouseClick(e, isDown) {
  if (viewRemoteView.classList.contains("active") && inputChannel && inputChannel.readyState === "open") {
    e.preventDefault();
    const { x, y } = getNormalizedCoordinates(e);
    
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
      y
    }));
  }
}

remoteScreenVideo.addEventListener("mousedown", (e) => handleMouseClick(e, true));
remoteScreenVideo.addEventListener("mouseup", (e) => handleMouseClick(e, false));
remoteScreenImg.addEventListener("mousedown", (e) => handleMouseClick(e, true));
remoteScreenImg.addEventListener("mouseup", (e) => handleMouseClick(e, false));

remoteScreenVideo.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

remoteScreenImg.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

function handleKeyEvent(e, isDown) {
  const screenFocused = document.activeElement === remoteScreenVideo || document.activeElement === remoteScreenImg;
  if (screenFocused && inputChannel && inputChannel.readyState === "open") {
    e.preventDefault();
    inputChannel.send(JSON.stringify({
      type: "key",
      keycode: e.keyCode,
      down: isDown
    }));
  }
}

window.addEventListener("keydown", (e) => handleKeyEvent(e, true));
window.addEventListener("keyup", (e) => handleKeyEvent(e, false));

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
// INITIALIZATION
// ----------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  discoverDisplays();
  
  viewOnboarding.classList.remove("active");
  showScreen(viewSelection);

  // Check for updates silently on startup
  checkForUpdatesSilently();
});
