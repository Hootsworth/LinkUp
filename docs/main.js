// Hardware OS and Architecture Detection
const btnDownload = document.getElementById("btn-primary-download");
const labelOs = document.getElementById("detected-os-label");

const RELEASE_BASE = "https://github.com/Hootsworth/LinkUp/releases/download/v0.3.0";
const RELEASE_PAGE = "https://github.com/Hootsworth/LinkUp/releases/latest";

const LINKS = {
  mac_silicon: `${RELEASE_BASE}/LinkUp_0.3.0_aarch64.dmg`,
  mac_intel: `${RELEASE_BASE}/LinkUp_0.3.0_x64.dmg`,
  windows: `${RELEASE_BASE}/LinkUp_0.3.0_x64-setup.exe`,
  linux: `${RELEASE_BASE}/linkup_0.3.0_amd64.deb`,
  generic: RELEASE_PAGE
};

function isAppleSilicon() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return false;
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return false;
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

    return (
      (renderer && renderer.toLowerCase().includes("apple")) ||
      (vendor && vendor.toLowerCase().includes("apple"))
    );
  } catch (e) {
    return false;
  }
}

function detectOS() {
  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes("macintosh") || ua.includes("mac os")) {
    if (isAppleSilicon()) {
      btnDownload.textContent = "Download for Mac (Silicon)";
      btnDownload.href = LINKS.mac_silicon;
      labelOs.textContent = "Detected: macOS (Apple Silicon)";
    } else {
      btnDownload.textContent = "Download for Mac (Intel)";
      btnDownload.href = LINKS.mac_intel;
      labelOs.textContent = "Detected: macOS (Intel)";
    }
  } else if (ua.includes("windows") || ua.includes("win32") || ua.includes("win64")) {
    btnDownload.textContent = "Download for Windows";
    btnDownload.href = LINKS.windows;
    labelOs.textContent = "Detected: Windows 10/11";
  } else if (ua.includes("linux") || ua.includes("ubuntu") || ua.includes("debian")) {
    btnDownload.textContent = "Download for Linux";
    btnDownload.href = LINKS.linux;
    labelOs.textContent = "Detected: Linux (Debian)";
  } else {
    btnDownload.textContent = "View all releases";
    btnDownload.href = LINKS.generic;
    labelOs.textContent = "Supported platforms: macOS, Windows, Linux";
  }
}

// Single Page View Router
function handleRouting() {
  const hash = window.location.hash || '#home';
  
  const screens = {
    '#home': { screen: document.getElementById("screen-home"), nav: document.getElementById("nav-home") },
    '#features': { screen: document.getElementById("screen-features"), nav: document.getElementById("nav-features") },
    '#releases': { screen: document.getElementById("screen-releases"), nav: document.getElementById("nav-releases") }
  };
  
  Object.values(screens).forEach(item => {
    if (item.screen) item.screen.classList.remove("active");
    if (item.nav) item.nav.classList.remove("active");
  });
  
  const activeItem = screens[hash] || screens['#home'];
  if (activeItem.screen) activeItem.screen.classList.add("active");
  if (activeItem.nav) activeItem.nav.classList.add("active");
}

window.addEventListener("hashchange", handleRouting);
window.addEventListener("DOMContentLoaded", () => {
  detectOS();
  handleRouting();
});

// ----------------------------------------------------
// WebRTC Connection Simulator Logic
// ----------------------------------------------------
const btnRunSim = document.getElementById("btn-run-sim");
const simPasscodeBox = document.querySelector(".sim-passcode-box");
const simClientStatus = document.querySelector(".sim-client-status");
const pipelinePath = document.getElementById("pipeline-path");
const pipelinePulse = document.getElementById("pipeline-pulse");
const pipelineStatus = document.getElementById("pipeline-status");
const simHostStatus = document.querySelector(".sim-host-status");
const clientBadge = document.querySelector(".sim-client .sim-badge");
const clientScreenContent = document.querySelector(".sim-client .sim-screen-content");

let simState = "idle"; // idle, running, connected
let simTimeoutId = null;

if (btnRunSim) {
  btnRunSim.addEventListener("click", () => {
    if (simState === "connected") {
      resetSim();
    } else if (simState === "idle") {
      runSim();
    }
  });
}

function resetSim() {
  if (simTimeoutId) {
    clearTimeout(simTimeoutId);
    simTimeoutId = null;
  }
  
  simState = "idle";
  btnRunSim.textContent = "Launch Connection Simulation";
  btnRunSim.style.opacity = "1";
  btnRunSim.disabled = false;
  
  if (simPasscodeBox) {
    simPasscodeBox.textContent = "------";
    simPasscodeBox.style.opacity = "0.1";
  }
  if (simClientStatus) {
    simClientStatus.textContent = "Enter pairing passcode to start";
  }
  if (clientBadge) {
    clientBadge.textContent = "Disconnected";
    clientBadge.style.background = "rgba(28,28,28,0.06)";
    clientBadge.style.color = "var(--text-muted)";
  }
  
  if (pipelinePath) pipelinePath.classList.remove("pulse-active");
  if (pipelinePulse) pipelinePulse.style.display = "none";
  if (pipelineStatus) {
    pipelineStatus.textContent = "Offline";
    pipelineStatus.style.color = "var(--text-muted)";
  }
  
  if (simHostStatus) {
    simHostStatus.textContent = "Listening for client pairing...";
  }
  
  if (clientScreenContent) {
    clientScreenContent.innerHTML = `
      <div class="sim-passcode-box" style="font-size: 24px; font-weight: 600; letter-spacing: 2px; color: var(--charcoal); font-family: var(--font-mono); opacity: 0.1; transition: opacity 0.5s ease;">------</div>
      <div class="sim-client-status" style="font-size: 13px; color: var(--text-muted); margin-top: 8px; text-align: center;">Enter pairing passcode to start</div>
    `;
  }
}

function runSim() {
  simState = "running";
  btnRunSim.textContent = "Simulating...";
  btnRunSim.style.opacity = "0.5";
  btnRunSim.disabled = true;
  
  // 1. ICE Gathering phase
  if (pipelineStatus) {
    pipelineStatus.textContent = "ICE Gathering";
    pipelineStatus.style.color = "#d84315";
  }
  if (simClientStatus) simClientStatus.textContent = "Gathering local ICE candidates...";
  if (simHostStatus) simHostStatus.textContent = "Checking ICE constraints...";
  
  simTimeoutId = setTimeout(() => {
    // 2. Passcode Entry phase
    if (simClientStatus) simClientStatus.textContent = "Entering pairing code: 584921";
    const box = document.querySelector(".sim-passcode-box");
    if (box) box.style.opacity = "1";
    
    let chars = "584921";
    let current = "";
    let i = 0;
    const interval = setInterval(() => {
      current += chars[i];
      let padded = current + "-".repeat(6 - current.length);
      const activeBox = document.querySelector(".sim-passcode-box");
      if (activeBox) activeBox.textContent = padded;
      i++;
      
      if (i >= chars.length) {
        clearInterval(interval);
        
        // 3. Signaling phase
        simTimeoutId = setTimeout(() => {
          if (pipelineStatus) {
            pipelineStatus.textContent = "Direct Sync (LDSH)";
            pipelineStatus.style.color = "#1565c0";
          }
          if (simClientStatus) simClientStatus.textContent = "Pairing with 192.168.1.72:8081...";
          if (simHostStatus) simHostStatus.textContent = "Connection code matched!";
          
          simTimeoutId = setTimeout(() => {
            // 4. Establish WebRTC Stream
            simState = "connected";
            btnRunSim.disabled = false;
            btnRunSim.textContent = "Disconnect Simulation";
            btnRunSim.style.opacity = "1";
            
            const activeBadge = document.querySelector(".sim-client .sim-badge");
            if (activeBadge) {
              activeBadge.textContent = "Connected";
              activeBadge.style.background = "#e8f5e9";
              activeBadge.style.color = "#2e7d32";
            }
            
            if (pipelinePath) pipelinePath.classList.add("pulse-active");
            if (pipelinePulse) pipelinePulse.style.display = "block";
            if (pipelineStatus) {
              pipelineStatus.textContent = "P2P Active";
              pipelineStatus.style.color = "#2e7d32";
            }
            
            if (simHostStatus) simHostStatus.textContent = "Streaming screen canvas... (Client: 192.168.1.45)";
            
            const activeScreen = document.querySelector(".sim-client .sim-screen-content");
            if (activeScreen) {
              activeScreen.innerHTML = `
                <div class="scrolling-desktop">
                  <div class="scrolling-desktop-content">
                    <div class="desktop-card">
                      <span style="font-weight: 500;">main.rs</span>
                      <p style="color: #81c784; font-size: 8px; margin-top: 2px;">fn start_signaling_server()...</p>
                    </div>
                    <div class="desktop-card">
                      <span style="font-weight: 500;">Connection Health</span>
                      <p style="color: #64b5f6; font-size: 8px; margin-top: 2px;">ICE check: completed (P2P)</p>
                    </div>
                    <div class="desktop-card">
                      <span style="font-weight: 500;">Active Handshake</span>
                      <p style="color: #ffb74d; font-size: 8px; margin-top: 2px;">Port: 8081 / LDSH pair</p>
                    </div>
                  </div>
                  <div class="sim-hud-stats">
                    <div>RTT: 4ms</div>
                    <div>FPS: 60</div>
                    <div>Loss: 0.0%</div>
                  </div>
                </div>
              `;
            }
          }, 1500);
        }, 1000);
      }
    }, 250);
  }, 1500);
}
