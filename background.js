importScripts('utils.js');

let lockWindowId = null;
let isLocking = false;

chrome.runtime.onStartup.addListener(lockOnBrowserStart);
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ isAuthenticated: false });
    await chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
    return;
  }

  await lockOnBrowserStart();
});

// Always force authentication after a real browser restart. The previous
// isAuthenticated value is intentionally ignored here.
async function lockOnBrowserStart() {
  const { passwordHash } = await chrome.storage.local.get('passwordHash');

  if (!passwordHash) {
    await initializeIdleDetection();
    return;
  }

  await chrome.storage.local.set({ isAuthenticated: false });
  await lockBrowser({ preserveExistingSession: true });
  await initializeIdleDetection();
}

async function initializeIdleDetection() {
  const { idleTimeSeconds } = await chrome.storage.local.get('idleTimeSeconds');
  chrome.idle.setDetectionInterval(Number(idleTimeSeconds) || 300);
}

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState !== 'idle' && newState !== 'locked') return;

  const data = await chrome.storage.local.get([
    'idleTimeEnabled',
    'isAuthenticated',
    'passwordHash'
  ]);

  if (data.idleTimeEnabled && data.isAuthenticated && data.passwordHash) {
    await lockBrowser({ preserveExistingSession: false });
  }
});

async function lockBrowser({ preserveExistingSession = false } = {}) {
  if (isLocking || lockWindowId !== null) return;
  isLocking = true;

  try {
    const { passwordHash } = await chrome.storage.local.get('passwordHash');
    if (!passwordHash) return;

    await chrome.storage.local.set({ isAuthenticated: false });

    const windows = await chrome.windows.getAll({ populate: true });
    const currentSession = [];

    for (const win of windows) {
      if (win.id === lockWindowId) continue;

      const tabs = (win.tabs || [])
        .filter((tab) => tab.url && !tab.url.startsWith(chrome.runtime.getURL('')))
        .map((tab) => ({
          url: tab.url,
          active: Boolean(tab.active),
          pinned: Boolean(tab.pinned)
        }));

      if (tabs.length) {
        currentSession.push({
          windowId: win.id,
          tabs,
          state: win.state || 'normal',
          focused: Boolean(win.focused)
        });
      }
    }

    const stored = await chrome.storage.local.get(['savedSession', 'sessionTimestamp']);
    const sessionToKeep = preserveExistingSession && stored.savedSession?.length
      ? stored.savedSession
      : currentSession;

    await chrome.storage.local.set({
      savedSession: sessionToKeep,
      sessionTimestamp: preserveExistingSession && stored.sessionTimestamp
        ? stored.sessionTimestamp
        : Date.now()
    });

    const lockWindow = await chrome.windows.create({
      url: chrome.runtime.getURL('lockscreen.html'),
      type: 'popup',
      state: 'fullscreen'
    });
    lockWindowId = lockWindow.id;

    await Promise.all(
      windows
        .filter((win) => win.id !== lockWindowId)
        .map((win) => chrome.windows.remove(win.id).catch(() => undefined))
    );
  } catch (error) {
    console.error('Error locking browser:', error);
  } finally {
    isLocking = false;
  }
}

async function restoreBrowser() {
  const { savedSession: session = [] } = await chrome.storage.local.get('savedSession');

  try {
    for (const windowData of session) {
      if (!windowData.tabs?.length) continue;

      const [firstTab, ...remainingTabs] = windowData.tabs;
      const restoredWindow = await chrome.windows.create({
        url: firstTab.url,
        state: windowData.state === 'minimized' ? 'normal' : (windowData.state || 'normal'),
        focused: Boolean(windowData.focused)
      });

      const createdTabs = await chrome.tabs.query({ windowId: restoredWindow.id });
      if (createdTabs[0] && firstTab.pinned) {
        await chrome.tabs.update(createdTabs[0].id, { pinned: true });
      }

      for (const tab of remainingTabs) {
        await chrome.tabs.create({
          windowId: restoredWindow.id,
          url: tab.url,
          active: Boolean(tab.active),
          pinned: Boolean(tab.pinned)
        });
      }
    }

    if (!session.length) await chrome.windows.create({ state: 'maximized' });

    await chrome.storage.local.set({ isAuthenticated: true });
    await chrome.storage.local.remove(['savedSession', 'sessionTimestamp']);

    if (lockWindowId !== null) {
      await chrome.windows.remove(lockWindowId).catch(() => undefined);
      lockWindowId = null;
    }

    await initializeIdleDetection();
  } catch (error) {
    console.error('Error restoring browser session:', error);
    throw error;
  }
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  if (windowId !== lockWindowId) return;

  lockWindowId = null;
  const data = await chrome.storage.local.get(['isAuthenticated', 'passwordHash']);
  if (data.passwordHash && !data.isAuthenticated) {
    await lockBrowser({ preserveExistingSession: true });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'lockBrowser') {
    lockBrowser({ preserveExistingSession: false })
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'unlockBrowser') {
    restoreBrowser()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'updateIdleTime') {
    initializeIdleDetection()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});
