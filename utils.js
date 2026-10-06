// ============================================================
// Browser Lock – shared utilities
// Crypto: PBKDF2-SHA256 (100k iterations) + per-secret random
// salt. Legacy plain-SHA-256 hashes are transparently migrated
// on first successful verification.
// ============================================================

const PBKDF2_ITERATIONS = 100000;

// ---------- Legacy hashing (migration only) ----------

async function hashString(text) {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return toHex(buffer);
}

// ---------- Modern password hashing ----------

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSaltHex(bytes = 16) {
  const salt = crypto.getRandomValues(new Uint8Array(bytes));
  return toHex(salt);
}

// Derives a PBKDF2-SHA256 hash of `text` with the given hex salt.
async function deriveHash(text, saltHex, iterations = PBKDF2_ITERATIONS) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(text),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const salt = hexToBytes(saltHex);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256
  );
  return toHex(bits);
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

// Creates a storable record for a new secret.
async function createSecretRecord(text) {
  const salt = randomSaltHex();
  return {
    v: 2,
    salt,
    iterations: PBKDF2_ITERATIONS,
    hash: await deriveHash(text, salt)
  };
}

// Constant-time comparison of two hex strings (timing-safe).
function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Verifies `text` against a stored record (v2) or legacy plain hash.
// Returns { ok, migrated? } – migrated carries the new v2 record that
// the caller should persist after a successful legacy verification.
async function verifySecret(text, stored) {
  if (!stored) return { ok: false };

  // v2 record: { v: 2, salt, iterations, hash }
  if (stored && typeof stored === 'object' && stored.v === 2) {
    const hash = await deriveHash(text, stored.salt, stored.iterations);
    return { ok: secureEqual(hash, stored.hash) };
  }

  // Legacy: plain SHA-256 hex string.
  if (typeof stored === 'string') {
    const hash = await hashString(text);
    if (secureEqual(hash, stored)) {
      return { ok: true, migrated: await createSecretRecord(text) };
    }
    return { ok: false };
  }

  return { ok: false };
}

// ---------- Generic helpers ----------

function isEmpty(str) {
  return !str || str.trim().length === 0;
}

function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = 'message ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.display = 'none';
  }, 4000);
}

// Fills a <select> with the security questions (XSS-safe).
// Questions are shown in the current UI language; the stored value
// is always the stable English index.
function populateQuestionSelect(select) {
  select.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('selectQuestion');
  select.appendChild(placeholder);
  getSecurityQuestionsLocalized().forEach((question, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = question;
    select.appendChild(option);
  });
}

// Keeps the three question <select>s in sync: a question that is
// already selected in one dropdown is hidden in the other two, so
// the same question can never be chosen twice. Call this after
// every change and after pre-filling values.
function syncQuestionSelects(ids) {
  const selects = ids.map((id) => document.getElementById(id));
  const selected = new Set(
    selects.map((select) => select.value).filter((value) => value !== '')
  );

  for (const select of selects) {
    for (const option of select.options) {
      if (option.value === '') continue; // placeholder stays visible
      // Hide options chosen in ANOTHER select; always keep the
      // option this select itself currently has.
      option.hidden = selected.has(option.value) && option.value !== select.value;
    }
  }
}

// Security questions are stored in ENGLISH (stable keys for the
// recovery flow) but displayed in the selected UI language.
const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'In which city were you born?',
  "What is your mother's maiden name?",
  'What was the name of your first school?',
  'What is your favorite book?',
  'What was your childhood nickname?',
  'What was the name of your best childhood friend?',
  'On what street did you grow up?'
];

// Translated display texts for the security questions, indexed the
// same way as SECURITY_QUESTIONS.
const SECURITY_QUESTIONS_I18N = {
  en: [
    'What was the name of your first pet?',
    'In which city were you born?',
    "What is your mother's maiden name?",
    'What was the name of your first school?',
    'What is your favorite book?',
    'What was your childhood nickname?',
    'What was the name of your best childhood friend?',
    'On what street did you grow up?'
  ],
  de: [
    'Wie hieß dein erstes Haustier?',
    'In welcher Stadt wurdest du geboren?',
    'Wie lautet der Mädchenname deiner Mutter?',
    'Wie hieß deine erste Schule?',
    'Was ist dein Lieblingsbuch?',
    'Wie war dein Spitzname als Kind?',
    'Wie hieß dein bester Kindheitsfreund?',
    'In welcher Straße bist du aufgewachsen?'
  ],
  es: [
    '¿Cómo se llamaba tu primera mascota?',
    '¿En qué ciudad naciste?',
    '¿Cuál es el apellido de soltera de tu madre?',
    '¿Cómo se llamaba tu primera escuela?',
    '¿Cuál es tu libro favorito?',
    '¿Cuál era tu apodo de infancia?',
    '¿Cómo se llamaba tu mejor amigo de la infancia?',
    '¿En qué calle creciste?'
  ],
  fr: [
    'Quel était le nom de votre premier animal ?',
    'Dans quelle ville êtes-vous né(e) ?',
    'Quel est le nom de jeune fille de votre mère ?',
    'Comment s\'appelait votre première école ?',
    'Quel est votre livre préféré ?',
    'Quel était votre surnom d\'enfance ?',
    'Comment s\'appelait votre meilleur ami d\'enfance ?',
    'Dans quelle rue avez-vous grandi ?'
  ],
  it: [
    'Come si chiamava il tuo primo animale?',
    'In quale città sei nato/a?',
    'Qual è il cognome da nubile di tua madre?',
    'Come si chiamava la tua prima scuola?',
    'Qual è il tuo libro preferito?',
    'Qual era il tuo soprannome da bambino?',
    'Come si chiamava il tuo migliore amico d\'infanzia?',
    'In quale strada sei cresciuto/a?'
  ],
  pt: [
    'Qual era o nome do seu primeiro animal de estimação?',
    'Em qual cidade você nasceu?',
    'Qual é o sobrenome de solteira da sua mãe?',
    'Como se chamava sua primeira escola?',
    'Qual é o seu livro favorito?',
    'Qual era seu apelido de infância?',
    'Como se chamava seu melhor amigo de infância?',
    'Em qual rua você cresceu?'
  ],
  ru: [
    'Как звали вашего первого питомца?',
    'В каком городе вы родились?',
    'Девичья фамилия вашей матери?',
    'Как называлась ваша первая школа?',
    'Какая у вас любимая книга?',
    'Какое у вас было детское прозвище?',
    'Как звали вашего лучшего друга детства?',
    'На какой улице вы выросли?'
  ],
  zh: [
    '你的第一只宠物叫什么名字？',
    '你在哪个城市出生？',
    '你母亲的娘家姓是什么？',
    '你的第一所学校叫什么名字？',
    '你最喜欢的书是什么？',
    '你小时候的绰号是什么？',
    '你童年最好的朋友叫什么名字？',
    '你在哪条街上长大？'
  ],
  ja: [
    '最初のペットの名前は何ですか？',
    'どの都市で生まれましたか？',
    '母親の旧姓は何ですか？',
    '最初の学校の名前は何ですか？',
    '好きな本は何ですか？',
    '子供の頃のあだ名は何でしたか？',
    '子供の頃の親友の名前は何ですか？',
    'どの通りで育ちましたか？'
  ],
  ko: [
    '첫 반려동물의 이름은 무엇인가요?',
    '어느 도시에서 태어났나요?',
    '어머니의 성은 무엇인가요?',
    '첫 학교 이름은 무엇인가요?',
    '가장 좋아하는 책은 무엇인가요?',
    '어릴 때 별명은 무엇이었나요?',
    '어릴 때 가장 친한 친구 이름은 무엇인가요?',
    '어느 거리에서 자랐나요?'
  ],
  hi: [
    'आपके पहले पालतू जानवर का नाम क्या था?',
    'आप किस शहर में पैदा हुए?',
    'आपकी माँ का मैडन नाम क्या था?',
    'आपके पहले स्कूल का नाम क्या था?',
    'आपकी पसंदीदा किताब क्या है?',
    'आपका बचपन का उपनाम क्या था?',
    'आपके बचपन के सबसे अच्छे दोस्त का नाम क्या था?',
    'आप किस गली में बड़े हुए?'
  ],
  ar: [
    'ما كان اسم أول حيوان أليف لديك؟',
    'في أي مدينة وُلدت؟',
    'ما هو اسم عائلة أمك قبل الزواج؟',
    'ما كان اسم مدرستك الأولى؟',
    'ما هو كتابك المفضل؟',
    'ما كان لقبك في طفولتك؟',
    'ما كان اسم أفضل صديق في طفولتك؟',
    'في أي شارع كبرت؟'
  ],
  tr: [
    'İlk evcil hayvanınızın adı neydi?',
    'Hangi şehirde doğdunuz?',
    'Annenizin kızlık soyadı nedir?',
    'İlk okulunuzun adı neydi?',
    'En sevdiğiniz kitap nedir?',
    'Çocukluk lakabınız neydi?',
    'Çocukluk arkadaşınızın adı neydi?',
    'Hangi sokakta büyüdünüz?'
  ]
};

// Returns the security question texts in the current UI language.
function getSecurityQuestionsLocalized() {
  const lang = getLang();
  return (SECURITY_QUESTIONS_I18N[lang] || SECURITY_QUESTIONS_I18N.en);
}