// Utility functions for the extension

// Hash a string using SHA-256
async function hashString(text) {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if a string is empty or just whitespace
function isEmpty(str) {
  return !str || str.trim().length === 0;
}

// Show a status message in the UI
function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = 'message ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 4000);
}

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "In which city were you born?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What is your favorite book?",
  "What was your childhood nickname?",
  "What was the name of your best childhood friend?",
  "On what street did you grow up?"
];
