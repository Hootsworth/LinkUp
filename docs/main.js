// Hardware OS and Architecture Detection
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
  const btnDownload = document.getElementById("btn-primary-download");
  const labelOs = document.getElementById("detected-os-label");
  if (!btnDownload || !labelOs) return;

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

  const hasRoutingScreens = Object.values(screens).some(item => item.screen !== null);
  if (!hasRoutingScreens) return;
  
  Object.values(screens).forEach(item => {
    if (item.screen) item.screen.classList.remove("active");
    if (item.nav) item.nav.classList.remove("active");
  });
  
  const activeItem = screens[hash] || screens['#home'];
  if (activeItem) {
    if (activeItem.screen) activeItem.screen.classList.add("active");
    if (activeItem.nav) activeItem.nav.classList.add("active");
  }
}

// Tabs Switcher for Documentation Page
function switchTab(tabId) {
  document.querySelectorAll('.docs-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.docs-tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const targetBtn = Array.from(document.querySelectorAll('.docs-tab-btn')).find(btn => {
    const clickAttr = btn.getAttribute('onclick') || '';
    return clickAttr.includes(tabId);
  });
  const targetPane = document.getElementById('pane-' + tabId);

  if (targetBtn) targetBtn.classList.add('active');
  if (targetPane) targetPane.classList.add('active');
}
window.switchTab = switchTab;

// Sticky Header Scroll Effect
function handleHeaderScroll() {
  const header = document.querySelector(".landing-header");
  if (header) {
    if (window.scrollY > 10) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  }
}

window.addEventListener("scroll", handleHeaderScroll);
window.addEventListener("hashchange", handleRouting);
window.addEventListener("DOMContentLoaded", () => {
  detectOS();
  handleRouting();
  handleHeaderScroll();
});


