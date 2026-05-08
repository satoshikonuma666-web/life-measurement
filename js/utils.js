// ===== Date Utilities =====

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatYearMonth(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMonthDays(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function getWeekdayJa(dateStr) {
  const d = parseDate(dateStr);
  return WEEKDAYS_JA[d.getDay()];
}

function formatJapaneseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

function formatDeadlineLabel(deadline, precision) {
  const [y, m, d] = deadline.split('-').map(Number);
  if (precision === 'year') return `${y}年末まで`;
  if (precision === 'month') return `${y}年${m}月末まで`;
  return `${y}年${m}月${d}日まで`;
}

function getDaysUntil(dateStr) {
  const target = parseDate(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function shiftDate(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function todayStr() {
  return formatDate(new Date());
}

function buildDeadline(year, month, day, precision) {
  if (precision === 'year') return `${year}-12-31`;
  if (precision === 'month') {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ===== Category definitions =====
const CATEGORIES = [
  {
    key: '3shin', label: '3つの「しん」', labelEn: '3SHIN',
    color: '#C4A882', icon: '❤️',
    items: [
      { key: 'shin_kokoro', label: '心 (こころ)', type: 'number', min: 0, max: 10 },
      { key: 'shin_karada', label: '身 (からだ)', type: 'number', min: 0, max: 10 },
      { key: 'shin_atarashii', label: '新 (あたらしい)', type: 'number', min: 0, max: 10 },
    ]
  },
  {
    key: 'relation', label: '人間関係', labelEn: 'RELATION',
    color: '#7BA0C4', icon: '👥',
    items: [
      { key: 'relation_aisatsu', label: '挨拶', type: 'rating' },
      { key: 'relation_renraku', label: '連絡', type: 'rating' },
      { key: 'relation_au', label: '会う', type: 'rating' },
    ]
  },
  {
    key: 'sleep', label: '睡眠', labelEn: 'SLEEP',
    color: '#9B7BC4', icon: '🌙',
    items: [
      { key: 'sleep_kishou', label: '起床', type: 'rating' },
      { key: 'sleep_shushin', label: '就寝', type: 'rating' },
      { key: 'sleep_jikan', label: '睡眠時間', type: 'hours', min: 0, max: 12, step: 0.5 },
    ]
  },
  {
    key: 'body', label: '身体', labelEn: 'BODY',
    color: '#A0C47B', icon: '🏃',
    items: [
      { key: 'body_aruku', label: '歩く', type: 'rating' },
      { key: 'body_kintore', label: '筋トレ', type: 'rating' },
      { key: 'body_stretch', label: 'ストレッチ', type: 'rating' },
      { key: 'body_supli', label: 'サプリ', type: 'rating' },
      { key: 'body_kouryuu', label: '交流', type: 'rating' },
    ]
  },
  {
    key: 'life', label: '暮らし', labelEn: 'LIFE',
    color: '#C47B7B', icon: '📖',
    items: [
      { key: 'life_dokusho', label: '読書', type: 'rating' },
      { key: 'life_eigo', label: '英語', type: 'rating' },
      { key: 'life_sumaho', label: 'スマホ', type: 'rating' },
      { key: 'life_tv', label: 'TV', type: 'rating' },
      { key: 'life_shumi', label: '趣味', type: 'rating' },
    ]
  },
];

// SVG icons for tab bar & UI
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
  goals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>',
  close: '✕',
  chevronLeft: '‹',
  chevronRight: '›',
  star: '★',
  starEmpty: '☆',
};

// Emoji map for goal categories (web-friendly)
const CAT_EMOJI = {
  '👤': '👤', '💼': '💼', '👨‍👩‍👧': '👨‍👩‍👧', '💰': '💰', '💪': '💪', '📚': '📚',
};
