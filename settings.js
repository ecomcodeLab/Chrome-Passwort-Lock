document.addEventListener('DOMContentLoaded', async () => {
  const idleEnable = document.getElementById('idle-enable');
  const idleTime = document.getElementById('idle-time');
  let currentPasswordHash = '';

  // Load initial settings
  try {
    const data = await chrome.storage.local.get(['idleTimeEnabled', 'idleTimeSeconds', 'passwordHash']);
    currentPasswordHash = data.passwordHash;
    
    if (data.idleTimeEnabled !== undefined) {
      idleEnable.checked = data.idleTimeEnabled;
    }
    if (data.idleTimeSeconds) {
      idleTime.value = data.idleTimeSeconds.toString();
    }
  } catch (e) {
    console.error("Error loading settings", e);
  }

  // Save Idle Settings
  document.getElementById('btn-save-idle').addEventListener('click', async () => {
    const enabled = idleEnable.checked;
    const seconds = parseInt(idleTime.value);

    await chrome.storage.local.set({
      idleTimeEnabled: enabled,
      idleTimeSeconds: seconds
    });

    chrome.runtime.sendMessage({ 
      action: 'updateIdleTime', 
      enabled: enabled, 
      seconds: seconds 
    }, () => {
      showMessage('status-msg', 'Auto-lock settings saved successfully!', false);
    });
  });

  // Change Password
  document.getElementById('btn-change-password').addEventListener('click', async () => {
    const current = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-new-password').value;

    if (!current || !newPass || !confirm) {
      showMessage('status-msg', 'Please fill all password fields.', true);
      return;
    }

    const hash = await hashString(current);
    if (hash !== currentPasswordHash) {
      showMessage('status-msg', 'Current password is incorrect.', true);
      return;
    }

    if (newPass.length < 6) {
      showMessage('status-msg', 'New password must be at least 6 characters.', true);
      return;
    }

    if (newPass !== confirm) {
      showMessage('status-msg', 'New passwords do not match.', true);
      return;
    }

    const newHash = await hashString(newPass);
    await chrome.storage.local.set({ passwordHash: newHash });
    currentPasswordHash = newHash;
    
    // Clear inputs
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-new-password').value = '';
    
    showMessage('status-msg', 'Password updated successfully!', false);
  });

  // Security Questions Logic
  const selects = [document.getElementById('q1'), document.getElementById('q2'), document.getElementById('q3')];
  selects.forEach(select => {
    select.innerHTML = '<option value="">Select a question...</option>';
    SECURITY_QUESTIONS.forEach((q, i) => {
      select.innerHTML += `<option value="${i}">${q}</option>`;
    });
  });

  document.getElementById('btn-verify-sq').addEventListener('click', async () => {
    const current = document.getElementById('sq-current-password').value;
    if (!current) return;
    
    const hash = await hashString(current);
    if (hash === currentPasswordHash) {
      document.getElementById('sq-verify-section').style.display = 'none';
      document.getElementById('sq-update-section').style.display = 'block';
    } else {
      showMessage('status-msg', 'Incorrect password.', true);
    }
  });

  document.getElementById('btn-save-sq').addEventListener('click', async () => {
    const q1 = document.getElementById('q1').value;
    const q2 = document.getElementById('q2').value;
    const q3 = document.getElementById('q3').value;
    
    const a1 = document.getElementById('a1').value.trim().toLowerCase();
    const a2 = document.getElementById('a2').value.trim().toLowerCase();
    const a3 = document.getElementById('a3').value.trim().toLowerCase();

    if (!q1 || !q2 || !q3) {
      showMessage('status-msg', 'Please select 3 questions.', true);
      return;
    }
    if (q1 === q2 || q2 === q3 || q1 === q3) {
      showMessage('status-msg', 'Please select 3 different questions.', true);
      return;
    }
    if (a1.length < 3 || a2.length < 3 || a3.length < 3) {
      showMessage('status-msg', 'Answers must be at least 3 characters long.', true);
      return;
    }

    const securityAnswer1Hash = await hashString(a1);
    const securityAnswer2Hash = await hashString(a2);
    const securityAnswer3Hash = await hashString(a3);

    await chrome.storage.local.set({
      securityQuestion1: SECURITY_QUESTIONS[parseInt(q1)],
      securityAnswer1Hash,
      securityQuestion2: SECURITY_QUESTIONS[parseInt(q2)],
      securityAnswer2Hash,
      securityQuestion3: SECURITY_QUESTIONS[parseInt(q3)],
      securityAnswer3Hash
    });

    // Reset view
    document.getElementById('sq-verify-section').style.display = 'block';
    document.getElementById('sq-update-section').style.display = 'none';
    document.getElementById('sq-current-password').value = '';
    
    showMessage('status-msg', 'Security questions updated successfully!', false);
  });
});