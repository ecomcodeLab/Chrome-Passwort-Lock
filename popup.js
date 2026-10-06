document.addEventListener('DOMContentLoaded', async () => {
  // No language switcher in the popup – it follows the language
  // chosen on the other pages (kept in sync via chrome.storage).
  initI18n(null);

  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');
  const btnLock = document.getElementById('btn-lock');
  const btnLockLabel = document.getElementById('btn-lock-label');
  let setupMode = false;

  function refreshStatus() {
    chrome.storage.local.get(['isAuthenticated', 'passwordHash']).then((data) => {
      if (!data.passwordHash) {
        statusLabel.textContent = t('notConfigured');
        statusDot.className = 'status-indicator status-locked';
        btnLock.disabled = false;
        btnLock.classList.remove('danger');
        btnLockLabel.textContent = t('openSetup');
        setupMode = true;
      } else if (!data.isAuthenticated) {
        statusLabel.textContent = t('statusLocked');
        statusDot.className = 'status-indicator status-locked';
        btnLock.disabled = true;
      } else {
        statusLabel.textContent = t('statusUnlocked');
        statusDot.className = 'status-indicator status-unlocked';
      }
    }).catch((error) => console.error(error));
  }
  refreshStatus();

  // Update texts when the language changes (also when it is changed
  // on another page while the popup is open).
  document.addEventListener('langchange', refreshStatus);

  btnLock.addEventListener('click', () => {
    if (setupMode) {
      chrome.tabs.create({ url: 'setup.html' });
      window.close();
      return;
    }
    chrome.runtime.sendMessage({ action: 'lockBrowser' }, () => {
      window.close();
    });
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'settings.html' });
    window.close();
  });
});