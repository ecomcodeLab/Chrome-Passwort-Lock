importScripts('utils.js');

let lockWindowId = null;
let isLocking = false;

// Initialize extension state on startup
chrome.runtime.onStartup.addListener(checkAndLockBrowser);
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'setup.html' });
  } else {
    checkAndLockBrowser();
  }
});

// Load idle settings
async function initializeIdleDetection() {
  const data = await chrome.storage.local.get(['idleTimeEnabled', 'idleTimeSeconds']);
  if (data.idleTimeEnabled && data.idleTimeSeconds) {
    chrome.idle.setDetectionInterval(data.idleTimeSeconds);
  }
}

// Listen for idle state changes
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    const data = await chrome.storage.local.get(['idleTimeEnabled', 'isAuthenticated', 'passwordHash']);
    if (data.idleTimeEnabled && data.isAuthenticated && data.passwordHash) {
      await lockBrowser();
    }
  }
});

// Main lock function
async function lockBrowser() {
  if (isLocking) return;
  isLocking = true;

  try {
    const data = await chrome.storage.local.get(['isAuthenticated', 'passwordHash']);
    if (!data.passwordHash) {
      isLocking = false;
      return; // Not set up yet
    }

    await chrome.storage.local.set({ isAuthenticated: false });

    // 1. Capture current windows and tabs
    const windows = await chrome.windows.getAll({ populate: true });
    const sessionData = [];

    for (const win of windows) {
      // Don't save the lock screen window if it somehow exists
      if (win.id === lockWindowId) continue;
      
      const tabsToSave = win.tabs
        .filter(t => !t.url.includes(chrome.runtime.id)) // Exclude extension pages
        .map(t => ({ url: t.url, active: t.active, pinned: t.pinned }));
      
      if (tabsToSave.length > 0) {
        sessionData.push({ windowId: win.id, tabs: tabsToSave, state: win.state });
      }
    }

    // Save session
    await chrome.storage.local.set({
      savedSession: sessionData,
      sessionTimestamp: Date.now()
    });

    // 2. Create the lock window
    const lockWin = await chrome.windows.create({
      url: chrome.runtime.getURL('lockscreen.html'),
      type: 'popup',
      state: 'fullscreen'
    });
    lockWindowId = lockWin.id;

    // 3. Close all other windows
    for (const win of windows) {
      if (win.id !== lockWindowId) {
        chrome.windows.remove(win.id);
      }
    }
  } catch (error) {
    console.error("Error locking browser:", error);
  } finally {
    isLocking = false;
  }
}

// Restore session
async function restoreBrowser() {
  const data = await chrome.storage.local.get(['savedSession']);
  await chrome.storage.local.set({ isAuthenticated: true });

  const session = data.savedSession;
  
  if (session && session.length > 0) {
    for (let i = 0; i < session.length; i++) {
      const winData = session[i];
      if (winData.tabs.length === 0) continue;

      // Create window with first tab
      const firstTab = winData.tabs[0];
      const newWin = await chrome.windows.create({
        url: firstTab.url,
        state: winData.state === 'minimized' ? 'normal' : winData.state
      });

      // Pin first tab if needed
      if (firstTab.pinned) {
        const tabs = await chrome.tabs.query({ windowId: newWin.id });
        if (tabs.length > 0) chrome.tabs.update(tabs[0].id, { pinned: true });
      }

      // Add remaining tabs
      for (let j = 1; j < winData.tabs.length; j++) {
        const tabData = winData.tabs[j];
        await chrome.tabs.create({
          windowId: newWin.id,
          url: tabData.url,
          active: tabData.active,
          pinned: tabData.pinned
        });
      }
    }
  } else {
    // If no session, just open a new tab
    chrome.windows.create({ state: 'maximized' });
  }

  // Clear session data and close lock window
  await chrome.storage.local.remove(['savedSession', 'sessionTimestamp']);
  if (lockWindowId) {
    chrome.windows.remove(lockWindowId);
    lockWindowId = null;
  }
  
  // Reset idle timer
  initializeIdleDetection();
}

// Prevent closing the lock window without authentication
chrome.windows.onRemoved.addListener(async (windowId) => {
  if (windowId === lockWindowId) {
    lockWindowId = null;
    const data = await chrome.storage.local.get(['isAuthenticated', 'passwordHash']);
    if (!data.isAuthenticated && data.passwordHash) {
      // User tried to bypass by closing the lock window. Re-lock immediately.
      lockBrowser();
    }
  }
});

async function checkAndLockBrowser() {
  const data = await chrome.storage.local.get(['passwordHash', 'isAuthenticated']);
  if (data.passwordHash && !data.isAuthenticated) {
    lockBrowser();
  }
  initializeIdleDetection();
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'lockBrowser') {
    lockBrowser().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'unlockBrowser') {
    restoreBrowser().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'updateIdleTime') {
    if (request.enabled && request.seconds) {
      chrome.idle.setDetectionInterval(request.seconds);
    }
    sendResponse({ success: true });
    return true;
  }
});