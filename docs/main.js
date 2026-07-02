// Hardware OS and Architecture Detection
const btnDownload = document.getElementById("btn-primary-download");
const labelOs = document.getElementById("detected-os-label");

// Release download base links (GitHub Releases v0.1.0)
const RELEASE_BASE = "https://github.com/Hootsworth/LinkUp/releases/download/v0.1.0";
const RELEASE_PAGE = "https://github.com/Hootsworth/LinkUp/releases/latest";

const LINKS = {
  mac_silicon: `${RELEASE_BASE}/LinkUp_0.1.0_aarch64.dmg`,
  mac_intel: `${RELEASE_BASE}/LinkUp_0.1.0_x64.dmg`,
  windows: `${RELEASE_BASE}/LinkUp_0.1.0_x64-setup.exe`,
  linux: `${RELEASE_BASE}/linkup_0.1.0_amd64.deb`,
  generic: RELEASE_PAGE
};

// Check for Apple Silicon M-series GPU
function isAppleSilicon() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return false;
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return false;
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    
    // Apple Silicon GPUs report as Apple GPU or Apple M1/M2/M3
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
  
  // 1. macOS
  if (ua.includes("macintosh") || ua.includes("mac os")) {
    if (isAppleSilicon()) {
      btnDownload.textContent = "Download LinkUp for macOS (Apple Silicon)";
      btnDownload.href = LINKS.mac_silicon;
      labelOs.textContent = "Detected: macOS (Apple Silicon M1/M2/M3)";
    } else {
      btnDownload.textContent = "Download LinkUp for macOS (Intel)";
      btnDownload.href = LINKS.mac_intel;
      labelOs.textContent = "Detected: macOS (Intel processor)";
    }
  }
  // 2. Windows
  else if (ua.includes("windows") || ua.includes("win32") || ua.includes("win64")) {
    btnDownload.textContent = "Download LinkUp for Windows (x64)";
    btnDownload.href = LINKS.windows;
    labelOs.textContent = "Detected: Windows 10 / 11";
  }
  // 3. Linux Ubuntu / Debian
  else if (ua.includes("linux") || ua.includes("ubuntu") || ua.includes("debian")) {
    btnDownload.textContent = "Download LinkUp for Linux (.deb)";
    btnDownload.href = LINKS.linux;
    labelOs.textContent = "Detected: Linux (Ubuntu / Debian x64)";
  }
  // 4. Fallback (Generic view releases)
  else {
    btnDownload.textContent = "View all releases on GitHub";
    btnDownload.href = LINKS.generic;
    labelOs.textContent = "Supported platforms: macOS, Windows, Linux";
  }
}

// Single Page View Router
function handleRouting() {
  const hash = window.location.hash || '#home';
  const homeScreen = document.getElementById("screen-home");
  const featuresScreen = document.getElementById("screen-features");
  const navHome = document.getElementById("nav-home");
  const navFeatures = document.getElementById("nav-features");

  if (hash === '#features') {
    homeScreen.classList.remove("active");
    featuresScreen.classList.add("active");
    navHome.classList.remove("active");
    navFeatures.classList.add("active");
  } else {
    // Default to Home Screen
    featuresScreen.classList.remove("active");
    homeScreen.classList.add("active");
    navFeatures.classList.remove("active");
    navHome.classList.add("active");
  }
}

// Event Listeners
window.addEventListener("hashchange", handleRouting);
window.addEventListener("DOMContentLoaded", () => {
  detectOS();
  handleRouting();
});
