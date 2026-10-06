document.addEventListener('DOMContentLoaded', () => {
  initI18n('lang-switcher');

  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const dot1 = document.getElementById('dot1');
  const dot2 = document.getElementById('dot2');
  const dot3 = document.getElementById('dot3');
  const subtitle = document.getElementById('subtitle');
  const questionIds = ['q1', 'q2', 'q3'];
  let masterPassword = '';
  let busy = false;

  function fillQuestionSelects() {
    questionIds.forEach((id) => populateQuestionSelect(document.getElementById(id)));
    syncQuestionSelects(questionIds);
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

  function showStep(step) {
    [step1, step2, step3].forEach((el) => { el.style.display = 'none'; });
    [dot1, dot2, dot3].forEach((el) => { el.classList.remove('active'); });
    step.style.display = 'block';
    if (step === step1) dot1.classList.add('active');
    if (step === step2) dot2.classList.add('active');
    if (step === step3) dot3.classList.add('active');
  }

  // ---------- Step 1 -> 2 (password only, NO waiting period here) ----------

  document.getElementById('btn-next').addEventListener('click', () => {
    const password = document.getElementById('password').value;
    const confirmation = document.getElementById('confirm-password').value;

    if (password.length < 6) {
      showMessage('status-msg', t('passwordMin'), true);
      return;
    }
    if (password !== confirmation) {
      showMessage('status-msg', t('passwordsMismatch'), true);
      return;
    }

    masterPassword = password;
    showStep(step2);
    subtitle.textContent = t('subtitleQuestions');
  });

  // ---------- Step 2 -> 3 ----------

  document.getElementById('btn-next2').addEventListener('click', () => {
    const questionIndexes = questionIds.map((id) => document.getElementById(id).value);
    const answers = ['a1', 'a2', 'a3'].map((id) =>
      document.getElementById(id).value.trim().toLowerCase()
    );

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

    // Keep the captured answers in memory until the final save.
    window.__pendingAnswers = { questionIndexes, answers };
    showStep(step3);
    subtitle.textContent = t('waitPeriod');
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    showStep(step1);
    subtitle.textContent = t('subtitleSetup');
  });

  document.getElementById('btn-back2').addEventListener('click', () => {
    showStep(step2);
    subtitle.textContent = t('subtitleQuestions');
  });

  // ---------- Step 3 (LAST step): waiting period + finish ----------

  document.getElementById('btn-finish').addEventListener('click', async () => {
    if (busy) return;
    const pending = window.__pendingAnswers;
    if (!pending) {
      showStep(step2);
      return;
    }

    busy = true;
    try {
      const [passwordRecord, ...answerRecords] = await Promise.all([
        createSecretRecord(masterPassword),
        ...pending.answers.map(createSecretRecord)
      ]);

      await chrome.storage.local.set({
        passwordHash: passwordRecord,
        securityQuestion1: SECURITY_QUESTIONS[Number(pending.questionIndexes[0])],
        securityAnswer1Hash: answerRecords[0],
        securityQuestion2: SECURITY_QUESTIONS[Number(pending.questionIndexes[1])],
        securityAnswer2Hash: answerRecords[1],
        securityQuestion3: SECURITY_QUESTIONS[Number(pending.questionIndexes[2])],
        securityAnswer3Hash: answerRecords[2],
        isAuthenticated: true,
        idleTimeEnabled: true,
        idleTimeSeconds: 300,
        lockOnStartup: true,
        // PANIC key is configured ONLY in the settings (freely
        // choosable combination). Setup stores the OFF state and a
        // sensible default so the settings page has a starting value.
        panicEnabled: false,
        panicKey: 'Ctrl+Shift+L',
        // Waiting period for a full reset, chosen ONCE here (last
        // step). The lockscreen reuses this value and never asks again.
        resetWaitDays: Number(document.getElementById('reset-wait-days').value),
        excludedTabs: []
      });

      showMessage('status-msg', t('setupComplete'), false);
      setTimeout(() => window.close(), 2000);
    } catch (error) {
      console.error(error);
      showMessage('status-msg', t('errorSaving'), true);
    } finally {
      busy = false;
    }
  });
});