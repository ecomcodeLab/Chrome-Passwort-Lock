importScripts('utils.js');

// ============================================================
// Browser Lock – background service worker
//
// Guarantees:
// 1. Exactly ONE lock window per browser run:
//    - SESSION_LOCK_KEY ("startup applied") is set ONCE and kept
//      for the whole browser run (session storage auto-clears on
//      browser close). It is NEVER released in finally.
//    - lockBrowser() aborts if a lock window already exists.
// 2. Unlock can never bounce back into a lock:
//    - isAuthenticated is set to true BEFORE the lock window is
//      closed, so the onRemoved handler never sees an unlocked
//      browser without a lock window.
// 3. The lock window is closed LAST on unlock:
//    - If it were closed first and it was the only open window,
//      Chrome could shut down entirely ("close browser when last
//      window closes") before the restored windows are created.
//      So: restore the session FIRST, close the lock window LAST.
// 4. The session is never lost:
//    - At startup Chrome may not have restored tabs yet when the
//      lock runs, so we wait briefly for windows to appear.
//    - savedSession is kept after unlock (as a backup) and only
//      replaced at the next successful lock.
// 5. Setup is always reachable while unconfigured (no password).
// 6. Private tabs (excluded tabs) are closed on lock and are NOT
//    restored on unlock.
// 7. Optional: full factory reset after a configurable waiting
//    period (5/7/10 days) when the user is locked out and cannot
//    answer the security questions.
// 8. Idle lock: chrome.idle is SYSTEM-wide – 'idle' only fires
//    when the WHOLE computer is inactive. No extra focus checks:
//    a getLastFocused() guard would return a window whenever any
//    Chrome window exists and silently disable the idle lock.
// 9. Idle timeout: DEFAULT is 5 minutes (300 s), set during setup.
//    Any change in the settings is picked up immediately via the
//    storage.onChanged listener – the value is clamped to Chrome's
//    minimum (15 s) and a missing/invalid value always falls back
//    to the 5-minute default.
// ============================================================

const SESSION_LOCK_KEY = 'startupLockApplied';
const SESSION_LOCKING_KEY = 'lockingInProgress';
const RELOCK_SUPPRESS_MS = 3000;
const STARTUP_WAIT_MS = 5000;      // max wait for Chrome's session restore
const STARTUP_POLL_MS = 400;

// Idle lock defaults: 5 minutes, matching the setup wizard and the
// settings page ("5 minutes (Default)").
const DEFAULT_IDLE_SECONDS = 300;
const MIN_IDLE_SECONDS = 15;       // Chrome's minimum detection interval

// Factory-reset alarm (security-question bypass after waiting days).
const RESET_ALARM = 'bl_factory_reset';
const RESET_WAIT_DAYS = { 5: 5, 7: 7, 10: 10 };

let lastLockOperation = 0;

const lockUrl = chrome.runtime.getURL('lockscreen.html');
const extensionUrl = chrome.runtime.getURL('');

// Setup opens whenever the extension has no master password yet –
// regardless of install/update/reload reason.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const { passwordHash } = await chrome.storage.local.get('passwordHash');
    if (!passwordHash) {
      await chrome.storage.local.set({ isAuthenticated: false });
      await chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
    }
  } catch (error) {
    console.error('onInstalled failed:', error);
  }
});

chrome.runtime.onStartup.addListener(() => {
  enforceStartupLock();
});

// Also run when the worker wakes up for any other reason – the
// persistent session marker makes this idempotent per browser run.
enforceStartupLock();

// ---------- Race-safe session-flag helpers ----------
// chrome.storage has no transactions, so a plain check-then-set
// can race when two code paths run at once. Writing a unique
// token and re-reading it means only ONE writer ever wins.

async function acquireSessionFlag(key) {
  const token = crypto.randomUUID();
  const current = await chrome.storage.session.get(key);
  if (current[key]) return null; // already held
  await chrome.storage.session.set({ [key]: token });
  const after = await chrome.storage.session.get(key);
  return after[key] === token ? token : null;
}

async function releaseSessionFlag(key, token) {
  const current = await chrome.storage.session.get(key);
  if (current[key] === token) {
    await chrome.storage.session.remove(key);
  }
}

async function enforceStartupLock() {
  try {
    const [{ passwordHash, lockOnStartup }, session] = await Promise.all([
      chrome.storage.local.get(['passwordHash', 'lockOnStartup']),
      chrome.storage.session.get(SESSION_LOCK_KEY)
    ]);

    // Idle detection is always kept in sync with the settings,
    // lock or not.
    await initializeIdleDetection();

    if (lockOnStartup === false || !passwordHash) return;
    if (session[SESSION_LOCK_KEY]) return;

    // Race-safe acquisition. The winner KEEPS the marker for the
    // entire browser run – releasing it would re-trigger the lock
    // on every worker wakeup (this caused duplicate lock windows).
    const token = await acquireSessionFlag(SESSION_LOCK_KEY);
    if (!token) return;

    await lockBrowser({ preserveExistingSession: true, startup: true });
  } catch (error) {
    console.error('Startup lock failed:', error);
  }
}

// Keeps idle detection in sync with the settings.
// - Missing/invalid value -> 5-minute default, which is also
//   PERSISTED so the settings page always shows the real value.
// - Values below Chrome's minimum (15 s) are clamped.
async function initializeIdleDetection() {
  const { idleTimeSeconds } = await chrome.storage.local.get('idleTimeSeconds');
  let seconds = Number(idleTimeSeconds);
  if (!Number.isFinite(seconds) || seconds < MIN_IDLE_SECONDS) {
    seconds = DEFAULT_IDLE_SECONDS;
    // Persist the default so setup/settings and the background
    // always agree on the same timeout.
    await chrome.storage.local.set({ idleTimeSeconds: seconds });
  }
  chrome.idle.setDetectionInterval(seconds);
}

// React to idle-timeout changes from the settings page even if the
// "updateIdleTime" message is lost (e.g. worker was mid-restart).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.idleTimeSeconds || changes.idleTimeEnabled) {
    initializeIdleDetection().catch((error) =>
      console.error('Idle re-sync failed:', error)
    );
  }
});

// ---------- Idle lock (optional) ----------
// chrome.idle is SYSTEM-wide: 'idle' fires only when the WHOLE
// computer has been inactive for the configured time. If the user
// is typing anywhere (browser or another application), no idle
// event occurs – so no extra focus check is needed here. (A
// getLastFocused() guard would return a window whenever any Chrome
// window exists and silently disable the idle lock entirely.)

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState !== 'idle' && newState !== 'locked') return;

  const { idleTimeEnabled, isAuthenticated, passwordHash } =
    await chrome.storage.local.get(['idleTimeEnabled', 'isAuthenticated', 'passwordHash']);

  if (!idleTimeEnabled || !isAuthenticated || !passwordHash) return;

  await lockBrowser({ preserveExistingSession: false });
});

// ---------- PANIC key (chrome.commands) ----------
// The command only fires when the user has assigned the shortcut
// under chrome://extensions/shortcuts. It is honored ONLY when the
// PANIC key is enabled in the settings.

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'lock-now') return;
  const { panicEnabled, isAuthenticated, passwordHash } = await chrome.storage.local.get([
    'panicEnabled', 'isAuthenticated', 'passwordHash'
  ]);
  if (!panicEnabled || !passwordHash || !isAuthenticated) return;
  await lockBrowser({ preserveExistingSession: false });
});

// ---------- Private (excluded) tabs ----------

// Returns the set of URLs the user marked as "close on lock".
async function getExcludedUrls() {
  const { excludedTabs = [] } = await chrome.storage.local.get('excludedTabs');
  return new Set(excludedTabs.map((entry) => entry.url));
}

// Removes excluded tabs from a captured session.
function stripExcludedTabs(session, excluded) {
  return session.map((win) => {
    const tabs = win.tabs.filter((tab) => !excluded.has(tab.url));
    return { ...win, tabs };
  }).filter((win) => win.tabs.length > 0);
}

// ---------- Factory reset after waiting period ----------

// Called from the lockscreen when the user clicks "I forgot
// everything". Schedules a full reset after the configured number
// of days. Only ONE pending reset can exist at a time.
async function scheduleFactoryReset(days) {
  const waitDays = RESET_WAIT_DAYS[days] ? Number(days) : 7;
  const resetAt = Date.now() + waitDays * 24 * 60 * 60 * 1000;

  await chrome.storage.local.set({
    factoryResetAt: resetAt,
    factoryResetDays: waitDays
  });
  chrome.alarms.create(RESET_ALARM, { when: resetAt });
  return { resetAt, waitDays };
}

async function cancelFactoryReset() {
  await chrome.storage.local.remove(['factoryResetAt', 'factoryResetDays']);
  await chrome.alarms.clear(RESET_ALARM);
}

// Wipes ALL extension data. The next browser start opens the
// setup wizard again, as on first install.
async function performFactoryReset() {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  await chrome.alarms.clear(RESET_ALARM);
  // Close the lock window; onInstalled-style logic will offer setup
  // on the next start. Open setup directly so the user is guided.
  try {
    const stale = await getLockWindows();
    await Promise.all(stale.map((win) => chrome.windows.remove(win.id).catch(() => undefined)));
  } catch (_) { /* ignore */ }
  await chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
}

// ---------- Lock windows ----------

// Returns all current lock windows.
async function getLockWindows() {
  const windows = await chrome.windows.getAll({ populate: true });
  return windows.filter((win) =>
    (win.tabs || []).some((tab) => tab.url && tab.url.startsWith(lockUrl))
  );
}

// Closes lock windows (e.g. ones Chrome restored from the previous
// session via "continue where you left off").
async function closeStaleLockWindows() {
  try {
    const stale = await getLockWindows();
    await Promise.all(stale.map((win) => chrome.windows.remove(win.id).catch(() => undefined)));
    return stale.length > 0;
  } catch (error) {
    console.error('Failed to close stale lock windows:', error);
    return false;
  }
}

// At startup Chrome restores the previous session asynchronously.
// Wait briefly until at least one real (non-extension) window
// exists so the session is captured completely, not as empty.
async function waitForSessionWindows() {
  const deadline = Date.now() + STARTUP_WAIT_MS;
  while (Date.now() < deadline) {
    const windows = await chrome.windows.getAll({ populate: true });
    const hasRealWindow = windows.some((win) =>
      (win.tabs || []).some((tab) => tab.url && !tab.url.startsWith(extensionUrl))
    );
    if (hasRealWindow) return;
    await new Promise((resolve) => setTimeout(resolve, STARTUP_POLL_MS));
  }
}

function captureSession(windows) {
  const session = [];
  for (const win of windows) {
    const tabs = (win.tabs || [])
      .filter((tab) => tab.url && !tab.url.startsWith(extensionUrl))
      .map((tab) => ({
        url: tab.url,
        active: Boolean(tab.active),
        pinned: Boolean(tab.pinned)
      }));

    if (tabs.length) {
      session.push({
        tabs,
        state: win.state === 'minimized' ? 'normal' : (win.state || 'normal'),
        focused: Boolean(win.focused)
      });
    }
  }
  return session;
}

async function lockBrowser({ preserveExistingSession = false, startup = false } = {}) {
  // Cross-context guard: another lock attempt may already be in
  // progress. Token-based so two simultaneous callers cannot both
  // pass the check.
  const lockToken = await acquireSessionFlag(SESSION_LOCKING_KEY);
  if (!lockToken) return;

  try {
    const { passwordHash } = await chrome.storage.local.get('passwordHash');
    if (!passwordHash) return;

    // At startup, give Chrome time to restore the previous session
    // BEFORE we capture and close anything.
    if (startup) {
      await waitForSessionWindows();
    }

    // Remove lock windows Chrome may have restored from a previous
    // session BEFORE capturing tabs / creating a new lock window.
    await closeStaleLockWindows();

    // Hard idempotency check: if a lock window exists right now
    // (created by a concurrent path), never open a second one.
    const windows = await chrome.windows.getAll({ populate: true });
    if (
      windows.some((win) =>
        (win.tabs || []).some((tab) => tab.url && tab.url.startsWith(lockUrl))
      )
    ) {
      return;
    }

    const excluded = await getExcludedUrls();
    const currentSession = stripExcludedTabs(captureSession(windows), excluded);

    const stored = await chrome.storage.local.get(['savedSession', 'sessionTimestamp']);
    // Keep the previous saved session when preserving (startup) or
    // when the live capture came up empty – an empty capture at
    // startup must never wipe the user's tabs.
    const keepExisting =
      stored.savedSession?.length &&
      (preserveExistingSession || currentSession.length === 0);

    await chrome.storage.local.set({
      isAuthenticated: false,
      savedSession: keepExisting ? stored.savedSession : currentSession,
      sessionTimestamp: keepExisting ? stored.sessionTimestamp : Date.now()
    });

    // Close the user's private/excluded tabs NOW – they must not
    // stay open while the browser is locked.
    const excludedTabIds = [];
    for (const win of windows) {
      for (const tab of win.tabs || []) {
        if (tab.url && excluded.has(tab.url)) {
          excludedTabIds.push(tab.id);
        }
      }
    }
    await Promise.all(
      excludedTabIds.map((id) => chrome.tabs.remove(id).catch(() => undefined))
    );

    const lockWindow = await chrome.windows.create({
      url: chrome.runtime.getURL('lockscreen.html'),
      type: 'popup',
      state: 'normal',
      focused: true
    });

    await Promise.all(
      windows
        .filter((win) => win.id !== lockWindow?.id)
        .map((win) => chrome.windows.remove(win.id).catch(() => undefined))
    );
  } catch (error) {
    console.error('Error locking browser:', error);
  } finally {
    // Suppress onRemoved-triggered re-locks for the window
    // closures we just performed as part of this lock.
    lastLockOperation = Date.now();
    await releaseSessionFlag(SESSION_LOCKING_KEY, lockToken);
  }
}

async function restoreBrowser() {
  try {
    // CRITICAL ORDER: mark authenticated BEFORE anything else so
    // the onRemoved handler can never re-lock.
    await chrome.storage.local.set({ isAuthenticated: true });
    lastLockOperation = Date.now();

    const { savedSession: session = [] } = await chrome.storage.local.get('savedSession');

    // NOTE: savedSession is intentionally NOT deleted here. It stays
    // as a backup until the next successful lock overwrites it, so a
    // failed/incomplete capture can never lose the user's tabs.

    // STEP 1: Restore the user's windows FIRST – while the lock
    // window is still open. Closing the lock window first could
    // make it the last open window and cause Chrome to shut down
    // entirely before the new windows exist.
    let restoredAny = false;
    if (session.length) {
      for (const windowData of session) {
        if (!windowData.tabs?.length) continue;
        const ok = await restoreWindow(windowData);
        restoredAny = restoredAny || ok;
      }
    }

    // Guarantee: the user always ends up with at least one window.
    if (!restoredAny) {
      await createWindowSafely(null);
    }

    await initializeIdleDetection();

    // STEP 2: NOW close the lock window(s) – real windows already
    // exist, so Chrome cannot exit. Refresh the suppression window
    // right before closing so the focus churn of the closure can
    // never re-trigger a lock (this caused the "password accepted
    // but locked again" loop).
    lastLockOperation = Date.now();
    await closeStaleLockWindows();

    // Final sweep: close any lock window that may have appeared
    // in the meantime (e.g. restored by Chrome mid-unlock).
    lastLockOperation = Date.now();
    await closeStaleLockWindows();
  } catch (error) {
    console.error('Error restoring browser session:', error);
    // Never leave the user without a browser window.
    try {
      await createWindowSafely(null);
      lastLockOperation = Date.now();
      await closeStaleLockWindows();
    } catch (_) {
      /* nothing more we can do */
    }
    throw error;
  }
}

// Restores one saved window. Individual tab failures (e.g. blocked
// URLs) are logged but do not abort the whole restoration.
async function restoreWindow(windowData) {
  try {
    const [firstTab, ...remainingTabs] = windowData.tabs;

    const restoredWindow = await createWindowSafely(firstTab.url, {
      state: windowData.state === 'minimized' ? 'normal' : windowData.state || 'normal',
      focused: Boolean(windowData.focused)
    });

    const createdTabs = await chrome.tabs.query({ windowId: restoredWindow.id });
    if (createdTabs[0] && firstTab.pinned) {
      await chrome.tabs.update(createdTabs[0].id, { pinned: true }).catch(() => undefined);
    }

    for (const tab of remainingTabs) {
      try {
        await chrome.tabs.create({
          windowId: restoredWindow.id,
          url: tab.url,
          active: Boolean(tab.active),
          pinned: Boolean(tab.pinned)
        });
      } catch (tabError) {
        console.warn('Tab restore failed, opening fallback:', tab.url, tabError);
        await chrome.tabs.create({ windowId: restoredWindow.id, active: Boolean(tab.active) });
      }
    }
    return true;
  } catch (error) {
    console.error('Window restore failed:', error);
    // Fallback: open a blank window so this slot is not lost.
    try {
      await createWindowSafely(null);
    } catch (_) {
      /* ignore */
    }
    return false;
  }
}

// Creates a window with a safe URL. Some URLs (certain chrome://
// pages) can be rejected by windows.create – retry with no URL.
async function createWindowSafely(url, options = {}) {
  try {
    if (url) {
      return await chrome.windows.create({ url, state: 'maximized', ...options });
    }
  } catch (error) {
    console.warn('Window create with URL failed, using blank window:', url, error);
  }
  return chrome.windows.create({ state: 'maximized', ...options });
}

// If the lock window is closed without unlocking (e.g. killed),
// re-lock so the browser is never left unprotected. Heavily
// guarded to prevent re-lock loops:
//  1. Ignore events shortly after our own lock/unlock operation.
//  2. Ignore while a lock is in progress.
//  3. Only re-lock if NO lockscreen window exists anymore.
chrome.windows.onRemoved.addListener(async () => {
  try {
    if (Date.now() - lastLockOperation < RELOCK_SUPPRESS_MS) return;

    const session = await chrome.storage.session.get(SESSION_LOCKING_KEY);
    if (session[SESSION_LOCKING_KEY]) return;

    const { isAuthenticated, passwordHash } = await chrome.storage.local.get([
      'isAuthenticated',
      'passwordHash'
    ]);
    if (!passwordHash || isAuthenticated) return;

    const lockWindowStillOpen = (await getLockWindows()).length > 0;
    if (lockWindowStillOpen) return;

    await lockBrowser({ preserveExistingSession: true });
  } catch (error) {
    console.error('onRemoved handler failed:', error);
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const handlers = {
    lockBrowser: () => lockBrowser({ preserveExistingSession: false }),
    unlockBrowser: () => restoreBrowser(),
    updateIdleTime: () => initializeIdleDetection(),
    scheduleFactoryReset: () => scheduleFactoryReset(request.days),
    cancelFactoryReset: () => cancelFactoryReset(),
    performFactoryReset: () => performFactoryReset()
  };

  const handler = handlers[request.action];
  if (!handler) return false;

  handler()
    .then((result) => sendResponse({ success: true, result }))
    .catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});