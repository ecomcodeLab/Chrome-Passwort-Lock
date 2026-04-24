document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');
  const btnLock = document.getElementById('btn-lock');

  try {
    const data = await chrome.storage.local.get(['isAuthenticated', 'passwordHash']);
    if (!data.passwordHash) {
      statusLabel.textContent = "Not configured";
      statusDot.className = "status-indicator status-locked";
      btnLock.disabled = true;
    } else if (!data.isAuthenticated) {
      statusLabel.textContent = "Browser is locked";
      statusDot.className = "status-indicator status-locked";
      btnLock.disabled = true;
    } else {
      statusLabel.textContent = "Browser is unlocked";
      statusDot.className = "status-indicator status-unlocked";
    }
  } catch(e) {
    console.error(e);
  }

  btnLock.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'lockBrowser' }, () => {
      window.close();
    });
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'settings.html' });
    window.close();
  });
});