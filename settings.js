document.addEventListener('DOMContentLoaded', async () => {
  initI18n('lang-switcher');

  const idleEnable = document.getElementById('idle-enable');
  const idleTime = document.getElementById('idle-time');
  const startupLock = document.getElementById('startup-lock');
  const panicEnable = document.getElementById('panic-enable');
  const panicKey = document.getElementById('panic-key');
  const sqVerifySection = document.getElementById('sq-verify-section');
  const sqUpdateSection = document.getElementById('sq-update-section');
  const sqConfirmSection = document.getElementById('sq-confirm-section');
  const questionIds = ['q1', 'q2', 'q3'];
  let busy = false;

  // Pending edits captured in the editor, applied only after the
  // final password confirmation succeeds.
  let pendingQuestions = null;

  try {
    const data = await chrome.storage.local.get([
      'idleTimeEnabled', 'idleTimeSeconds', 'lockOnStartup',
      'panicEnabled', 'panicKey'
    ]);

    if (data.idleTimeEnabled !== undefined) idleEnable.checked = data.idleTimeEnabled;
    if (data.idleTimeSeconds) idleTime.value = String(data.idleTimeSeconds);
    startupLock.checked = data.lockOnStartup !== false;
    // PANIC key is OFF by default - only enabled when the user
    // explicitly activates it here.
    panicEnable.checked = Boolean(data.panicEnabled);
    if (data.panicKey) panicKey.value = data.panicKey;
  } catch (error) {
    console.error('Error loading settings:', error);
  }

  // ---------- Auto-lock ----------

  document.getElementById('btn-save-idle').addEventListener('click', async () => {
    await chrome.storage.local.set({
      idleTimeEnabled: idleEnable.checked,
      idleTimeSeconds: parseInt(idleTime.value, 10)
    });
    chrome.runtime.sendMessage({ action: 'updateIdleTime' }, () => {
      showMessage('status-msg', t('autoLockSaved'), false);
    });
  });

  // ---------- Startup lock ----------

  document.getElementById('btn-save-startup').addEventListener('click', async () => {
    await chrome.storage.local.set({ lockOnStartup: startupLock.checked });
    showMessage(
      'status-msg',
      startupLock.checked ? t('startupSavedOn') : t('startupSavedOff'),
      false
    );
  });

  // ---------- PANIC key ----------

  document.getElementById('btn-save-panic').addEventListener('click', async () => {
    await chrome.storage.local.set({
      panicEnabled: panicEnable.checked,
      panicKey: panicKey.value
    });
    showMessage(
      'status-msg',
      panicEnable.checked ? t('panicKeySaved') : t('panicSavedOff'),
      false
    );
  });

  // ---------- Private tabs (excluded from session restore) ----------

  const excludedInput = document.getElementById('excluded-url-input');
  const excludedList = document.getElementById('excluded-list');

  function normalizeUrl(raw) {
    const value = raw.trim();
    if (!value) return null;
    try {
      const url = new URL(value.startsWith('http') ? value : 'https://' + value);
      return url.origin + url.pathname;
    } catch (_) {
      return null;
    }
  }

  async function renderExcludedList() {
    const { excludedTabs = [] } = await chrome.storage.local.get('excludedTabs');
    excludedList.textContent = '';
    if (!excludedTabs.length) {
      const empty = document.createElement('li');
      empty.className = 'excluded-empty';
      // t() is evaluated at render time so the text always uses the
      // currently selected language.
      empty.textContent = t('noPrivateTabs');
      excludedList.appendChild(empty);
      return;
    }
    excludedTabs.forEach((entry, index) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.className = 'excluded-url';
      span.textContent = entry.url;
      const remove = document.createElement('button');
      remove.className = 'excluded-remove';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', 'Remove');
      remove.addEventListener('click', async () => {
        const { excludedTabs: current = [] } = await chrome.storage.local.get('excludedTabs');
        current.splice(index, 1);
        await chrome.storage.local.set({ excludedTabs: current });
        renderExcludedList();
      });
      li.appendChild(span);
      li.appendChild(remove);
      excludedList.appendChild(li);
    });
  }
  renderExcludedList();

  // Re-render the list when the language changes so the empty-state
  // text ("No private tabs added yet.") is translated too.
  document.addEventListener('langchange', renderExcludedList);

  document.getElementById('btn-add-excluded').addEventListener('click', async () => {
    const url = normalizeUrl(excludedInput.value);
    if (!url) {
      showMessage('status-msg', t('invalidUrl'), true);
      return;
    }
    const { excludedTabs = [] } = await chrome.storage.local.get('excludedTabs');
    if (excludedTabs.some((entry) => entry.url === url)) {
      showMessage('status-msg', t('alreadyListed'), true);
      return;
    }
    excludedTabs.push({ url, addedAt: Date.now() });
    await chrome.storage.local.set({ excludedTabs });
    excludedInput.value = '';
    renderExcludedList();
    showMessage('status-msg', t('privateTabAdded'), false);
  });

  // ---------- Export / Import ----------

  // Keys that are safe to export: configuration only. Passwords,
  // answer hashes and session data are NEVER included.
  // NOTE: security questions are deliberately NOT exported/imported.
  // The answer hashes stay on the device; importing question TEXTS
  // without their matching answer hashes would silently break the
  // recovery flow (questions shown would no longer match the
  // answers that unlock them).
  const EXPORTABLE_KEYS = [
    'lockOnStartup', 'idleTimeEnabled', 'idleTimeSeconds',
    'panicEnabled', 'panicKey',
    'excludedTabs', 'bl_lang'
  ];

  document.getElementById('btn-export').addEventListener('click', async () => {
    try {
      const data = await chrome.storage.local.get(EXPORTABLE_KEYS);
      const payload = {
        app: 'browser-lock',
        type: 'settings-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: data
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'browser-lock-settings.json';
      link.click();
      URL.revokeObjectURL(url);
      showMessage('status-msg', t('exportSuccess'), false);
    } catch (error) {
      console.error('Export failed:', error);
      showMessage('status-msg', t('exportFailed'), true);
    }
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload.app !== 'browser-lock' || payload.type !== 'settings-export') {
        showMessage('status-msg', t('importInvalidFile'), true);
        return;
      }
      const incoming = payload.settings || {};
      const clean = {};
      for (const key of EXPORTABLE_KEYS) {
        if (incoming[key] !== undefined) clean[key] = incoming[key];
      }
      await chrome.storage.local.set(clean);
      chrome.runtime.sendMessage({ action: 'updateIdleTime' }, () => undefined);
      // Reload the form values from storage.
      const data = await chrome.storage.local.get(EXPORTABLE_KEYS);
      if (data.idleTimeEnabled !== undefined) idleEnable.checked = data.idleTimeEnabled;
      if (data.idleTimeSeconds) idleTime.value = String(data.idleTimeSeconds);
      if (data.lockOnStartup !== undefined) startupLock.checked = data.lockOnStartup;
      panicEnable.checked = Boolean(data.panicEnabled);
      if (data.panicKey) panicKey.value = data.panicKey;
      renderExcludedList();
      showMessage('status-msg', t('importSuccess'), false);
    } catch (error) {
      console.error('Import failed:', error);
      showMessage('status-msg', t('importFailed'), true);
    } finally {
      event.target.value = '';
    }
  });

  // ---------- Change password ----------

  document.getElementById('btn-change-password').addEventListener('click', async () => {
    if (busy) return;
    const current = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-new-password').value;

    if (!current || !newPass || !confirm) {
      showMessage('status-msg', t('fillPasswordFields'), true);
      return;
    }

    busy = true;
    try {
      // Always verify against the FRESH stored record – it may have
      // been migrated to the PBKDF2 format in the meantime.
      const { passwordHash } = await chrome.storage.local.get('passwordHash');
      const result = await verifySecret(current, passwordHash);
      if (!result.ok) {
        showMessage('status-msg', t('currentIncorrect'), true);
        return;
      }
      if (result.migrated) {
        await chrome.storage.local.set({ passwordHash: result.migrated });
      }

      if (newPass.length < 6) {
        showMessage('status-msg', t('passwordMin'), true);
        return;
      }
      if (newPass !== confirm) {
        showMessage('status-msg', t('passwordsMismatch'), true);
        return;
      }

      const record = await createSecretRecord(newPass);
      await chrome.storage.local.set({ passwordHash: record });

      ['current-password', 'new-password', 'confirm-new-password'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      showMessage('status-msg', t('passwordUpdated'), false);
    } catch (error) {
      console.error('Password change failed:', error);
      showMessage('status-msg', t('errorUpdating'), true);
    } finally {
      busy = false;
    }
  });

  // ---------- Security questions ----------
  // Flow:
  //  1. Browser UNLOCKED  -> editor is shown directly.
  //     Browser LOCKED    -> master password must be verified first.
  //  2. User edits questions and clicks "Save Security Questions".
  //     The edits are NOT persisted yet – instead a confirmation
  //     step appears where the master password must be re-entered.
  //  3. Only after a correct confirmation password are the new
  //     questions and answers written to storage.

  function fillQuestionSelects() {
    questionIds.forEach((id) => populateQuestionSelect(document.getElementById(id)));
    // Re-apply the currently configured questions after a rebuild.
    chrome.storage.local.get([
      'securityQuestion1', 'securityQuestion2', 'securityQuestion3'
    ]).then((data) => {
      const map = { q1: data.securityQuestion1, q2: data.securityQuestion2, q3: data.securityQuestion3 };
      for (const [id, question] of Object.entries(map)) {
        if (!question) continue;
        const index = SECURITY_QUESTIONS.indexOf(question);
        if (index >= 0) document.getElementById(id).value = String(index);
      }
      syncQuestionSelects(questionIds);
    }).catch((error) => console.error('Failed to load current questions:', error));
  }
  fillQuestionSelects();

  // Rebuild the question dropdowns when the language changes so the
  // question texts appear in the selected language.
  document.addEventListener('langchange', fillQuestionSelects);

  // A question chosen in one dropdown disappears from the others.
  questionIds.forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      syncQuestionSelects(questionIds);
    });
  });

  // Decide the entry point: unlocked -> editor directly,
  // locked -> password verification first.
  (async () => {
    try {
      const { isAuthenticated } = await chrome.storage.local.get('isAuthenticated');
      if (isAuthenticated) {
        sqVerifySection.style.display = 'none';
        sqUpdateSection.style.display = 'block';
      } else {
        sqVerifySection.style.display = 'block';
        sqUpdateSection.style.display = 'none';
      }
    } catch (error) {
      console.error('Failed to determine lock state:', error);
      sqVerifySection.style.display = 'block';
    }
  })();

  function showEditor() {
    sqVerifySection.style.display = 'none';
    sqUpdateSection.style.display = 'block';
    sqConfirmSection.style.display = 'none';
  }

  function showConfirmation() {
    sqUpdateSection.style.display = 'none';
    sqConfirmSection.style.display = 'block';
    document.getElementById('sq-confirm-password').focus();
  }

  function resetQuestionFlow() {
    pendingQuestions = null;
    sqConfirmSection.style.display = 'none';
    document.getElementById('sq-confirm-password').value = '';
    // Return to the appropriate starting point.
    chrome.storage.local.get('isAuthenticated').then(({ isAuthenticated }) => {
      if (isAuthenticated) {
        showEditor();
      } else {
        sqUpdateSection.style.display = 'none';
        sqVerifySection.style.display = 'block';
        document.getElementById('sq-current-password').value = '';
      }
    });
  }

  // Step 1 (locked only): verify master password to open the editor.
  document.getElementById('btn-verify-sq').addEventListener('click', async () => {
    if (busy) return;
    const current = document.getElementById('sq-current-password').value;
    if (!current) {
      showMessage('sq-msg', t('enterCurrent'), true);
      return;
    }

    busy = true;
    try {
      // Fresh read: the record may be a legacy hash or a PBKDF2
      // record – verifySecret handles both and reports migration.
      const { passwordHash } = await chrome.storage.local.get('passwordHash');
      const result = await verifySecret(current, passwordHash);

      if (result.ok) {
        if (result.migrated) {
          await chrome.storage.local.set({ passwordHash: result.migrated });
        }
        showEditor();
        showMessage('sq-msg', t('passwordVerified'), false);
      } else {
        showMessage('sq-msg', t('incorrectPasswordSq'), true);
      }
    } catch (error) {
      console.error('Verification failed:', error);
      showMessage('sq-msg', t('errorVerifying'), true);
    } finally {
      busy = false;
    }
  });

  // Step 2: capture edits and require a confirmation password.
  document.getElementById('btn-save-sq').addEventListener('click', () => {
    if (busy) return;

    const questionIndexes = questionIds.map((id) => document.getElementById(id).value);
    const answers = ['a1', 'a2', 'a3'].map((id) =>
      document.getElementById(id).value.trim().toLowerCase()
    );

    // Validation errors are shown directly in the questions section.
    if (questionIndexes.some((value) => !value)) {
      showMessage('sq-msg', t('select3'), true);
      return;
    }
    if (new Set(questionIndexes).size !== 3) {
      showMessage('sq-msg', t('select3Different'), true);
      return;
    }
    if (answers.some((answer) => answer.length < 3)) {
      showMessage('sq-msg', t('answersMin'), true);
      return;
    }

    // Hold the edits in memory – nothing is saved until the
    // confirmation password is verified.
    pendingQuestions = {
      questions: questionIndexes.map((index) => SECURITY_QUESTIONS[Number(index)]),
      answers
    };
    showConfirmation();
    showMessage('sq-msg', t('changesCaptured'), false);
  });

  // Step 3: verify the confirmation password, then persist.
  document.getElementById('btn-confirm-sq').addEventListener('click', async () => {
    if (busy || !pendingQuestions) return;
    const confirmPass = document.getElementById('sq-confirm-password').value;
    if (!confirmPass) {
      showMessage('sq-msg', t('enterConfirm'), true);
      return;
    }

    busy = true;
    try {
      const { passwordHash } = await chrome.storage.local.get('passwordHash');
      const result = await verifySecret(confirmPass, passwordHash);

      if (!result.ok) {
        showMessage('sq-msg', t('incorrectPasswordSq'), true);
        return;
      }
      if (result.migrated) {
        await chrome.storage.local.set({ passwordHash: result.migrated });
      }

      const records = await Promise.all(pendingQuestions.answers.map(createSecretRecord));
      await chrome.storage.local.set({
        securityQuestion1: pendingQuestions.questions[0],
        securityAnswer1Hash: records[0],
        securityQuestion2: pendingQuestions.questions[1],
        securityAnswer2Hash: records[1],
        securityQuestion3: pendingQuestions.questions[2],
        securityAnswer3Hash: records[2]
      });

      // Clear the editor inputs.
      ['a1', 'a2', 'a3'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      pendingQuestions = null;
      resetQuestionFlow();
      showMessage('sq-msg', t('questionsUpdated'), false);
    } catch (error) {
      console.error('Saving questions failed:', error);
      showMessage('sq-msg', t('errorSavingQuestions'), true);
    } finally {
      busy = false;
    }
  });

  // Discard pending edits and return to the starting point.
  document.getElementById('btn-cancel-sq').addEventListener('click', () => {
    resetQuestionFlow();
    showMessage('sq-msg', t('changesDiscarded'), false);
  });
});