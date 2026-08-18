document.addEventListener('DOMContentLoaded', () => {
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const dot1 = document.getElementById('dot1');
  const dot2 = document.getElementById('dot2');
  const subtitle = document.getElementById('subtitle');
  let masterPassword = '';

  const selects = [document.getElementById('q1'), document.getElementById('q2'), document.getElementById('q3')];
  selects.forEach((select) => {
    select.innerHTML = '<option value="">Select a question...</option>';
    SECURITY_QUESTIONS.forEach((question, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = question;
      select.appendChild(option);
    });
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    const password = document.getElementById('password').value;
    const confirmation = document.getElementById('confirm-password').value;

    if (password.length < 6) {
      showMessage('status-msg', 'Password must be at least 6 characters.', true);
      return;
    }
    if (password !== confirmation) {
      showMessage('status-msg', 'Passwords do not match.', true);
      return;
    }

    masterPassword = password;
    step1.style.display = 'none';
    step2.style.display = 'block';
    dot1.classList.remove('active');
    dot2.classList.add('active');
    subtitle.textContent = 'Set up Security Questions (CRITICAL)';
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = 'block';
    dot2.classList.remove('active');
    dot1.classList.add('active');
    subtitle.textContent = 'Protect your browsing session with a master password.';
  });

  document.getElementById('btn-finish').addEventListener('click', async () => {
    const questionIndexes = [
      document.getElementById('q1').value,
      document.getElementById('q2').value,
      document.getElementById('q3').value
    ];
    const answers = [
      document.getElementById('a1').value.trim().toLowerCase(),
      document.getElementById('a2').value.trim().toLowerCase(),
      document.getElementById('a3').value.trim().toLowerCase()
    ];

    if (questionIndexes.some((value) => !value)) {
      showMessage('status-msg', 'Please select 3 questions.', true);
      return;
    }
    if (new Set(questionIndexes).size !== 3) {
      showMessage('status-msg', 'Please select 3 different questions.', true);
      return;
    }
    if (answers.some((answer) => answer.length < 3)) {
      showMessage('status-msg', 'Answers must be at least 3 characters long.', true);
      return;
    }

    try {
      const [passwordHash, ...answerHashes] = await Promise.all([
        hashString(masterPassword),
        ...answers.map(hashString)
      ]);

      await chrome.storage.local.set({
        passwordHash,
        securityQuestion1: SECURITY_QUESTIONS[Number(questionIndexes[0])],
        securityAnswer1Hash: answerHashes[0],
        securityQuestion2: SECURITY_QUESTIONS[Number(questionIndexes[1])],
        securityAnswer2Hash: answerHashes[1],
        securityQuestion3: SECURITY_QUESTIONS[Number(questionIndexes[2])],
        securityAnswer3Hash: answerHashes[2],
        // Setup is the only exception: the user should not be locked before
        // they have finished configuring the extension.
        isAuthenticated: true,
        idleTimeEnabled: true,
        idleTimeSeconds: 300
      });

      showMessage('status-msg', 'Setup complete! You can now close this tab.', false);
      setTimeout(() => window.close(), 2000);
    } catch (error) {
      console.error(error);
      showMessage('status-msg', 'Error saving settings.', true);
    }
  });
});
