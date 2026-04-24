document.addEventListener('DOMContentLoaded', async () => {
  const loginSection = document.getElementById('login-section');
  const recoverySection = document.getElementById('recovery-section');
  const resetSection = document.getElementById('reset-section');
  const mainTitle = document.getElementById('main-title');
  const statusMsg = document.getElementById('status-msg');

  // Input bindings
  const loginInput = document.getElementById('login-password');
  const recoveryInput = document.getElementById('recovery-answer');
  const qLabel = document.getElementById('recovery-question-label');
  const progressText = document.getElementById('recovery-progress');

  // Lockout state
  let lockoutUntil = 0;
  let attempts = 0;
  let recoveryStep = 1;

  // Stored Hashes & Questions
  let storedData = {};

  // Initialize
  try {
    storedData = await chrome.storage.local.get([
      'passwordHash', 
      'securityQuestion1', 'securityAnswer1Hash',
      'securityQuestion2', 'securityAnswer2Hash',
      'securityQuestion3', 'securityAnswer3Hash',
      'recoveryAttempts', 'recoveryLockoutUntil'
    ]);
    
    attempts = storedData.recoveryAttempts || 0;
    lockoutUntil = storedData.recoveryLockoutUntil || 0;
    
    checkLockout();
  } catch (e) {
    console.error("Failed to load storage", e);
  }

  function checkLockout() {
    if (Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 60000);
      showMessage('status-msg', `Too many attempts. Try again in ${remaining} minutes.`, true);
      document.getElementById('link-forgot').style.display = 'none';
      return true;
    }
    return false;
  }

  async function registerFailedAttempt() {
    attempts++;
    if (attempts >= 5) {
      lockoutUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
      await chrome.storage.local.set({ 
        recoveryAttempts: attempts,
        recoveryLockoutUntil: lockoutUntil
      });
      checkLockout();
      // Reset view to login
      recoverySection.style.display = 'none';
      loginSection.style.display = 'block';
    } else {
      await chrome.storage.local.set({ recoveryAttempts: attempts });
      showMessage('status-msg', `Incorrect. ${5 - attempts} attempts remaining.`, true);
    }
  }

  // LOGIN FLOW
  document.getElementById('btn-unlock').addEventListener('click', async () => {
    const pass = loginInput.value;
    if (!pass) return;

    const hash = await hashString(pass);
    if (hash === storedData.passwordHash) {
      chrome.runtime.sendMessage({ action: 'unlockBrowser' });
    } else {
      showMessage('status-msg', 'Incorrect password', true);
      loginInput.value = '';
    }
  });

  loginInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-unlock').click();
  });

  // RECOVERY FLOW
  document.getElementById('link-forgot').addEventListener('click', () => {
    if (checkLockout()) return;
    
    loginSection.style.display = 'none';
    recoverySection.style.display = 'block';
    mainTitle.textContent = "Account Recovery";
    recoveryStep = 1;
    loadRecoveryQuestion();
  });

  document.getElementById('btn-recovery-cancel').addEventListener('click', () => {
    recoverySection.style.display = 'none';
    loginSection.style.display = 'block';
    mainTitle.textContent = "Browser Locked";
    recoveryInput.value = '';
    showMessage('status-msg', '');
  });

  function loadRecoveryQuestion() {
    progressText.textContent = `Question ${recoveryStep} of 3`;
    recoveryInput.value = '';
    recoveryInput.focus();
    if (recoveryStep === 1) qLabel.textContent = storedData.securityQuestion1;
    else if (recoveryStep === 2) qLabel.textContent = storedData.securityQuestion2;
    else if (recoveryStep === 3) qLabel.textContent = storedData.securityQuestion3;
  }

  document.getElementById('btn-recovery-next').addEventListener('click', async () => {
    const ans = recoveryInput.value.trim().toLowerCase();
    if (!ans) return;

    const ansHash = await hashString(ans);
    let isCorrect = false;

    if (recoveryStep === 1 && ansHash === storedData.securityAnswer1Hash) isCorrect = true;
    else if (recoveryStep === 2 && ansHash === storedData.securityAnswer2Hash) isCorrect = true;
    else if (recoveryStep === 3 && ansHash === storedData.securityAnswer3Hash) isCorrect = true;

    if (isCorrect) {
      recoveryStep++;
      if (recoveryStep > 3) {
        // All correct
        await chrome.storage.local.set({ recoveryAttempts: 0, recoveryLockoutUntil: 0 });
        attempts = 0;
        showResetSection();
      } else {
        loadRecoveryQuestion();
      }
    } else {
      registerFailedAttempt();
    }
  });

  recoveryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-recovery-next').click();
  });

  // RESET FLOW
  function showResetSection() {
    recoverySection.style.display = 'none';
    resetSection.style.display = 'block';
    mainTitle.textContent = "Reset Password";
  }

  document.getElementById('btn-reset-password').addEventListener('click', async () => {
    const p1 = document.getElementById('new-password').value;
    const p2 = document.getElementById('confirm-new-password').value;

    if (p1.length < 6) {
      showMessage('status-msg', 'Password must be at least 6 characters.', true);
      return;
    }
    if (p1 !== p2) {
      showMessage('status-msg', 'Passwords do not match.', true);
      return;
    }

    const newHash = await hashString(p1);
    await chrome.storage.local.set({ passwordHash: newHash });
    
    showMessage('status-msg', 'Password successfully reset!', false);
    
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'unlockBrowser' });
    }, 1500);
  });
});