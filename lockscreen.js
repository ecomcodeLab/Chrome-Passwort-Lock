document.addEventListener('DOMContentLoaded', async () => {
  initI18n('lang-switcher');

  const loginSection = document.getElementById('login-section');
  const recoverySection = document.getElementById('recovery-section');
  const fullresetSection = document.getElementById('fullreset-section');
  const resetSection = document.getElementById('reset-section');
  const mainTitle = document.getElementById('main-title');
  const loginInput = document.getElementById('login-password');
  const recoveryInput = document.getElementById('recovery-answer');
  const qLabel = document.getElementById('recovery-question-label');
  const progressText = document.getElementById('recovery-progress');
  const btnUnlock = document.getElementById('btn-unlock');
  const resetWaitInfo = document.getElementById('reset-wait-info');
  const resetWaitDaysText = document.getElementById('reset-wait-days-text');

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000;

  let lockoutUntil = 0;
  let attempts = 0;
  let recoveryStep = 1;
  let storedData = {};
  let busy = false;

  try {
    storedData = await chrome.storage.local.get([
      'passwordHash',
      'securityQuestion1', 'securityAnswer1Hash',
      'securityQuestion2', 'securityAnswer2Hash',
      'securityQuestion3', 'securityAnswer3Hash',
      'recoveryAttempts', 'recoveryLockoutUntil',
      'factoryResetAt', 'factoryResetDays',
      // Waiting period chosen ONCE during setup - reused here,
      // the user is never asked for it again.
      'resetWaitDays'
    ]);
    attempts = storedData.recoveryAttempts || 0;
    lockoutUntil = storedData.recoveryLockoutUntil || 0;
    checkLockout();
  } catch (error) {
    console.error('Failed to load storage:', error);
  }

  loginInput.focus();

  function checkLockout() {
    if (Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 60000);
      showMessage('status-msg', t('tooManyAttempts', { n: remaining }), true);
      document.getElementById('link-forgot').style.display = 'none';
      btnUnlock.disabled = true;
      return true;
    }
    return false;
  }

  async function registerFailedAttempt() {
    attempts++;
    if (attempts >= MAX_ATTEMPTS) {
      lockoutUntil = Date.now() + LOCKOUT_MS;
      await chrome.storage.local.set({
        recoveryAttempts: attempts,
        recoveryLockoutUntil: lockoutUntil
      });
      recoverySection.style.display = 'none';
      loginSection.style.display = 'block';
      mainTitle.textContent = t('browserLocked');
      checkLockout();
    } else {
      await chrome.storage.local.set({ recoveryAttempts: attempts });
      showMessage('status-msg', t('attemptsRemaining', { n: MAX_ATTEMPTS - attempts }), true);
    }
  }

  // Persist a legacy -> PBKDF2 migration after successful verification.
  async function persistMigration(key, migrated) {
    if (migrated) await chrome.storage.local.set({ [key]: migrated });
  }

  // ---------- Login ----------

  async function attemptUnlock() {
    if (busy) return;
    const pass = loginInput.value;
    if (!pass) return;

    busy = true;
    try {
      const result = await verifySecret(pass, storedData.passwordHash);
      if (result.ok) {
        await persistMigration('passwordHash', result.migrated);
        // A successful unlock cancels any pending factory reset.
        await chrome.runtime.sendMessage({ action: 'cancelFactoryReset' }, () => undefined);
        chrome.runtime.sendMessage({ action: 'unlockBrowser' });
      } else {
        showMessage('status-msg', t('incorrectPassword'), true);
        loginInput.value = '';
        loginInput.focus();
      }
    } finally {
      busy = false;
    }
  }

  btnUnlock.addEventListener('click', attemptUnlock);
  loginInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptUnlock();
  });

  // ---------- Recovery ----------

  document.getElementById('link-forgot').addEventListener('click', () => {
    if (checkLockout()) return;
    loginSection.style.display = 'none';
    recoverySection.style.display = 'block';
    mainTitle.textContent = t('accountRecovery');
    recoveryStep = 1;
    loadRecoveryQuestion();
  });

  document.getElementById('btn-recovery-cancel').addEventListener('click', () => {
    recoverySection.style.display = 'none';
    loginSection.style.display = 'block';
    mainTitle.textContent = t('browserLocked');
    recoveryInput.value = '';
    showMessage('status-msg', '');
  });

  function loadRecoveryQuestion() {
    progressText.textContent = t('questionOf', { n: recoveryStep });
    recoveryInput.value = '';
    recoveryInput.focus();
    const stored = [
      storedData.securityQuestion1,
      storedData.securityQuestion2,
      storedData.securityQuestion3
    ];
    // Display the question in the UI language; fall back to the
    // stored (English) text if it is not in the known list.
    const localized = getSecurityQuestionsLocalized();
    const storedIndex = SECURITY_QUESTIONS.indexOf(stored[recoveryStep - 1]);
    qLabel.textContent = storedIndex >= 0 ? localized[storedIndex] : stored[recoveryStep - 1];
  }

  async function attemptRecovery() {
    if (busy) return;
    const ans = recoveryInput.value.trim().toLowerCase();
    if (!ans) {
      showMessage('status-msg', t('answerEmpty'), true);
      return;
    }

    busy = true;
    try {
      const key = `securityAnswer${recoveryStep}Hash`;
      const result = await verifySecret(ans, storedData[key]);

      if (result.ok) {
        await persistMigration(key, result.migrated);
        recoveryStep++;
        if (recoveryStep > 3) {
          await chrome.storage.local.set({ recoveryAttempts: 0, recoveryLockoutUntil: 0 });
          attempts = 0;
          recoverySection.style.display = 'none';
          resetSection.style.display = 'block';
          mainTitle.textContent = t('resetTitle');
        } else {
          loadRecoveryQuestion();
        }
      } else {
        registerFailedAttempt();
      }
    } finally {
      busy = false;
    }
  }

  document.getElementById('btn-recovery-next').addEventListener('click', attemptRecovery);
  recoveryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptRecovery();
  });

  // ---------- Full reset (last resort) ----------
  // Reachable ONLY from the recovery flow via "Forgot the answers?".
  // The waiting period (5/7/10 days) was chosen ONCE during setup
  // and is stored as resetWaitDays - it is shown here, never asked
  // again. Until it elapses the browser stays locked. A pending
  // reset shows its remaining time and is cancelled automatically
  // when the correct password is entered.

  document.getElementById('link-forgot-answers').addEventListener('click', () => {
    recoverySection.style.display = 'none';
    fullresetSection.style.display = 'block';
    mainTitle.textContent = t('fullResetTitle');
    renderResetStatus();
  });

  document.getElementById('btn-fullreset-cancel').addEventListener('click', () => {
    fullresetSection.style.display = 'none';
    recoverySection.style.display = 'block';
    mainTitle.textContent = t('accountRecovery');
    renderResetStatus();
  });

  function renderResetStatus() {
    const waitDays = Number(storedData.resetWaitDays) || 7;
    // Show the configured waiting period (from setup).
    resetWaitDaysText.textContent = t('waitPeriodChosen', { n: waitDays });

    if (!storedData.factoryResetAt) {
      resetWaitInfo.textContent = '';
      return;
    }
    const remainingMs = storedData.factoryResetAt - Date.now();
    if (remainingMs <= 0) {
      resetWaitInfo.textContent = t('resetPendingNow');
      return;
    }
    const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    resetWaitInfo.textContent = t('resetPendingIn', { n: days });
  }

  document.getElementById('btn-schedule-reset').addEventListener('click', async () => {
    if (busy) return;
    // Use the waiting period chosen during setup - no second ask.
    const days = Number(storedData.resetWaitDays) || 7;

    busy = true;
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'scheduleFactoryReset',
        days
      });
      if (response?.success) {
        storedData.factoryResetAt = response.result.resetAt;
        storedData.factoryResetDays = response.result.waitDays;
        showMessage('status-msg', t('resetScheduled', { n: response.result.waitDays }), false);
        renderResetStatus();
      } else {
        showMessage('status-msg', t('errorSchedulingReset'), true);
      }
    } finally {
      busy = false;
    }
  });

  // If the waiting period has already elapsed, offer the immediate
  // reset directly on the full-reset panel.
  if (storedData.factoryResetAt && Date.now() >= storedData.factoryResetAt) {
    loginSection.style.display = 'none';
    recoverySection.style.display = 'none';
    fullresetSection.style.display = 'block';
    mainTitle.textContent = t('fullResetTitle');
    resetWaitInfo.textContent = t('resetPendingNow');

    const executeBtn = document.createElement('button');
    executeBtn.className = 'danger mb-3';
    executeBtn.textContent = t('executeResetNow');
    executeBtn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ action: 'performFactoryReset' }, () => undefined);
    });
    fullresetSection.insertBefore(executeBtn, document.getElementById('btn-fullreset-cancel'));
  }

  // ---------- Reset (after successful recovery) ----------

  document.getElementById('btn-reset-password').addEventListener('click', async () => {
    const p1 = document.getElementById('new-password').value;
    const p2 = document.getElementById('confirm-new-password').value;

    if (p1.length < 6) {
      showMessage('status-msg', t('passwordMin'), true);
      return;
    }
    if (p1 !== p2) {
      showMessage('status-msg', t('passwordsMismatch'), true);
      return;
    }

    await chrome.storage.local.set({
      passwordHash: await createSecretRecord(p1),
      recoveryAttempts: 0,
      recoveryLockoutUntil: 0
    });

    showMessage('status-msg', t('resetSuccess'), false);
    setTimeout(() => chrome.runtime.sendMessage({ action: 'unlockBrowser' }), 1200);
  });
});