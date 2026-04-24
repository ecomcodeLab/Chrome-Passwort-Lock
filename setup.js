document.addEventListener('DOMContentLoaded', () => {
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const dot1 = document.getElementById('dot1');
  const dot2 = document.getElementById('dot2');
  const subtitle = document.getElementById('subtitle');
  
  let masterPassword = '';

  // Populate selects
  const selects = [document.getElementById('q1'), document.getElementById('q2'), document.getElementById('q3')];
  selects.forEach(select => {
    select.innerHTML = '<option value="">Select a question...</option>';
    SECURITY_QUESTIONS.forEach((q, i) => {
      select.innerHTML += `<option value="${i}">${q}</option>`;
    });
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    const pass = document.getElementById('password').value;
    const confirm = document.getElementById('confirm-password').value;

    if (pass.length < 6) {
      showMessage('status-msg', 'Password must be at least 6 characters.', true);
      return;
    }
    if (pass !== confirm) {
      showMessage('status-msg', 'Passwords do not match.', true);
      return;
    }

    masterPassword = pass;
    
    // Move to step 2
    step1.style.display = 'none';
    step2.style.display = 'block';
    dot1.classList.remove('active');
    dot2.classList.add('active');
    subtitle.textContent = "Set up Security Questions (CRITICAL)";
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = 'block';
    dot2.classList.remove('active');
    dot1.classList.add('active');
    subtitle.textContent = "Protect your browsing session with a master password.";
  });

  document.getElementById('btn-finish').addEventListener('click', async () => {
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

    try {
      // Hash everything
      const passwordHash = await hashString(masterPassword);
      const securityAnswer1Hash = await hashString(a1);
      const securityAnswer2Hash = await hashString(a2);
      const securityAnswer3Hash = await hashString(a3);

      const storageData = {
        passwordHash,
        securityQuestion1: SECURITY_QUESTIONS[parseInt(q1)],
        securityAnswer1Hash,
        securityQuestion2: SECURITY_QUESTIONS[parseInt(q2)],
        securityAnswer2Hash,
        securityQuestion3: SECURITY_QUESTIONS[parseInt(q3)],
        securityAnswer3Hash,
        isAuthenticated: true, // Auto-authenticate after setup
        idleTimeEnabled: true,
        idleTimeSeconds: 300 // default 5 minutes
      };

      await chrome.storage.local.set(storageData);
      
      showMessage('status-msg', 'Setup complete! You can now close this tab.', false);
      setTimeout(() => {
        window.close();
      }, 2000);

    } catch (err) {
      showMessage('status-msg', 'Error saving settings.', true);
      console.error(err);
    }
  });
});