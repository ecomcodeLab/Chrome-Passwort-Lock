// ============================================================
// Browser Lock – i18n loader
// The translations live in ONE FILE PER LANGUAGE under
// languages/<code>.js (each file sets I18N.<code>).
// This loader DYNAMICALLY INJECTS the needed language files,
// handles language detection, storage sync and applying texts.
//
// Usage:
//   t('key')                     -> translated string
//   applyI18n()                  -> translates [data-i18n] nodes
//   initI18n('switcher-id')      -> applies + builds language menu
//
// The selected language is stored in chrome.storage.local
// ("bl_lang") so ALL open extension pages stay in sync: changing
// the language on one page updates every other open page
// immediately via chrome.storage.onChanged.
// ============================================================

const I18N_LANGS = {
  en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français',
  it: 'Italiano', pt: 'Português', ru: 'Русский', zh: '中文',
  ja: '日本語', ko: '한국어', hi: 'हिन्दी', ar: 'العربية', tr: 'Türkçe'
};

// ---------- Language handling ----------
// The language is stored in chrome.storage.local ("bl_lang") so all
// open extension pages share ONE setting. localStorage is used as a
// fallback (e.g. when the page is opened outside the extension).

function i18nNormalizeLang(lang) {
  if (!lang) return 'en';
  const base = String(lang).toLowerCase().split('-')[0];
  return I18N_LANGS[base] ? base : 'en';
}

function getLang() {
  // Synchronous best guess: the cached value written by loadLang().
  try {
    const stored = localStorage.getItem('bl_lang');
    if (stored && I18N_LANGS[stored]) return stored;
  } catch (_) { /* ignore */ }
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language;
  return i18nNormalizeLang(nav);
}

// Loads the shared language from chrome.storage.local and caches it
// in localStorage so getLang() can read it synchronously.
async function loadLang() {
  try {
    const { bl_lang } = await chrome.storage.local.get('bl_lang');
    if (bl_lang && I18N_LANGS[bl_lang]) {
      try { localStorage.setItem('bl_lang', bl_lang); } catch (_) { /* ignore */ }
      return bl_lang;
    }
  } catch (_) { /* not running as an extension page */ }
  return getLang();
}

// Persists the language for ALL extension pages and notifies them.
async function setLang(lang) {
  const normalized = i18nNormalizeLang(lang);
  try { localStorage.setItem('bl_lang', normalized); } catch (_) { /* ignore */ }
  try {
    await chrome.storage.local.set({ bl_lang: normalized });
  } catch (_) {
    // Fallback outside the extension: notify this document only.
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: normalized } }));
  }
}

// ---------- Dynamic loading of language files ----------
// Each language lives in languages/<code>.js. English is ALWAYS
// loaded as the fallback dictionary. The current language file is
// injected on demand; loading is cached so it happens only once
// per page.

const _loadedLangs = new Set();
const _loadingLangs = new Map();

function injectLangScript(code) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `languages/${code}.js`;
    script.onload = () => resolve(code);
    script.onerror = () => reject(new Error(`Failed to load languages/${code}.js`));
    document.head.appendChild(script);
  });
}

// Ensures I18N.en and I18N[lang] are available before texts are used.
async function ensureLangLoaded(lang) {
  const jobs = [];
  if (!window.I18N || !I18N.en) {
    if (!_loadingLangs.has('en')) _loadingLangs.set('en', injectLangScript('en'));
    jobs.push(_loadingLangs.get('en'));
  }
  if (lang !== 'en' && !_loadedLangs.has(lang)) {
    if (!_loadingLangs.has(lang)) _loadingLangs.set(lang, injectLangScript(lang));
    jobs.push(_loadingLangs.get(lang));
  }
  if (jobs.length) {
    try {
      await Promise.all(jobs);
    } catch (error) {
      console.error(error);
    }
  }
  _loadedLangs.add('en');
  _loadedLangs.add(lang);
}

// Translate a key with optional {n} placeholder.
function t(key, params) {
  const lang = getLang();
  const dict = (window.I18N && I18N[lang]) || (window.I18N && I18N.en) || {};
  let text = dict[key] !== undefined ? dict[key] : ((window.I18N && I18N.en && I18N.en[key]) || key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return text;
}

// Applies translations to all [data-i18n] / [data-i18n-placeholder]
// nodes and sets the document direction for RTL languages.
function applyI18n() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
}

// Builds a small language <select> into the given container (pass
// null to only apply translations, e.g. in the popup). Changing it
// updates every open extension page via chrome.storage.onChanged.
function initI18n(switcherContainerId) {
  const container = switcherContainerId
    ? document.getElementById(switcherContainerId)
    : null;

  let select = null;
  if (container) {
    select = document.createElement('select');
    select.className = 'lang-switcher';
    select.setAttribute('aria-label', 'Language');

    for (const [code, name] of Object.entries(I18N_LANGS)) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      select.appendChild(option);
    }
    select.value = getLang();

    select.addEventListener('change', () => {
      setLang(select.value);
    });

    container.appendChild(select);
  }

  // Load the shared language + its dictionary, then apply texts.
  loadLang()
    .then((lang) => ensureLangLoaded(lang).then(() => lang))
    .then((lang) => {
      applyI18n();
      if (select) select.value = lang;
    })
    .catch((error) => console.error('i18n init failed:', error));

  // Another page changed the language -> load + re-apply here.
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.bl_lang) {
        const lang = i18nNormalizeLang(changes.bl_lang.newValue);
        try { localStorage.setItem('bl_lang', lang); } catch (_) { /* ignore */ }
        ensureLangLoaded(lang).then(() => {
          applyI18n();
          if (select) select.value = lang;
          // Let page scripts refresh dynamic texts (e.g. selects).
          document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
        });
      }
    });
  }
}