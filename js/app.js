// ===== Main Application =====

let currentPage = 'home';
let calendarYear, calendarMonth;

// ── App Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth() + 1;
  setupTabs();
  showPage('home');
  registerSW();
  // Initialize Firebase sync
  if (typeof initFirebase === 'function') {
    const ok = initFirebase();
    if (ok) {
      // Run initial sync after auth is ready
      setTimeout(() => { if (syncEnabled) fullSync(); }, 2000);
    }
  }
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ── Tab Navigation ──
function setupTabs() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      showPage(tab.dataset.page);
    });
  });
}

function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });
  // Load page data
  switch (page) {
    case 'home': loadHomePage(); break;
    case 'calendar': loadCalendarPage(); break;
    case 'stats': loadStatsPage(); break;
    case 'goals': loadGoalsPage(); break;
    case 'settings': break;
  }
}

// ════════════════════════════════
// HOME PAGE
// ════════════════════════════════
async function loadHomePage() {
  const today = todayStr();
  const record = await getRecord(today);
  renderShinCard(record, today);
  renderCategoryGrid(record);
  await renderNextActions();
  await renderUpcomingGoals();
}

function renderShinCard(record, today) {
  const el = document.getElementById('shin-card');
  const kokoro = record?.shin_kokoro ?? '-';
  const karada = record?.shin_karada ?? '-';
  const atarashii = record?.shin_atarashii ?? '-';
  const total = (record?.shin_kokoro ?? 0) + (record?.shin_karada ?? 0) + (record?.shin_atarashii ?? 0);
  const hasData = record && (record.shin_kokoro !== null || record.shin_karada !== null || record.shin_atarashii !== null);

  el.innerHTML = `
    <div class="shin-card-header">
      <div class="shin-card-title">今日の3つの「しん」</div>
      <div class="shin-card-date">${formatJapaneseDate(today)}（${getWeekdayJa(today)}）</div>
    </div>
    <div class="shin-score-row">
      <div class="shin-score-big">${hasData ? total : '-'}</div>
      <div class="shin-score-max">/ 30</div>
    </div>
    <div class="shin-items">
      <div class="shin-item"><span class="shin-item-label">心</span>${kokoro}</div>
      <div class="shin-item"><span class="shin-item-label">身</span>${karada}</div>
      <div class="shin-item"><span class="shin-item-label">新</span>${atarashii}</div>
    </div>
  `;
}

function renderCategoryGrid(record) {
  const el = document.getElementById('cat-grid');
  const cats = CATEGORIES.filter(c => c.key !== '3shin');
  el.innerHTML = cats.map(cat => {
    const badges = cat.items.map(item => {
      const v = record?.[item.key];
      if (v === null || v === undefined) return `<span class="cat-mini-badge" style="background:var(--bg);color:var(--text3)">-</span>`;
      if (item.type === 'rating') {
        const colors = { '◎': 'var(--excellent)', '〇': 'var(--good)', '△': 'var(--fair)', '✕': 'var(--poor)' };
        return `<span class="cat-mini-badge" style="background:${colors[v]}20;color:${colors[v]}">${v}</span>`;
      }
      if (item.type === 'hours') {
        return `<span class="cat-mini-badge" style="background:${cat.color}20;color:${cat.color}">${v}h</span>`;
      }
      return `<span class="cat-mini-badge" style="background:${cat.color}20;color:${cat.color}">${v}</span>`;
    }).join('');

    return `
      <div class="cat-grid-item">
        <div class="cat-grid-header">
          <div class="cat-icon-badge" style="background:${cat.color}18">${cat.icon}</div>
          <div>
            <div class="cat-grid-name" style="color:${cat.color}">${cat.label}</div>
            <div class="cat-grid-en">${cat.labelEn}</div>
          </div>
        </div>
        <div class="cat-grid-items">${badges}</div>
      </div>
    `;
  }).join('');
}

async function renderNextActions() {
  const el = document.getElementById('next-actions');
  const actions = await getNextActions(5);
  if (actions.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">進行中の目標はありません</div></div>';
    return;
  }
  el.innerHTML = actions.map(a => {
    const days = getDaysUntil(a.deadline);
    const daysText = days < 0 ? `${Math.abs(days)}日超過` : days === 0 ? '今日' : `あと${days}日`;
    const daysColor = days < 0 ? 'var(--warning)' : days <= 3 ? 'var(--warning)' : 'var(--text3)';
    return `
    <div class="next-action-item">
      <div class="next-action-dot" style="background:${a.color}"></div>
      <div class="next-action-body">
        <div class="next-action-title">${escHtml(a.stepTitle)}</div>
        <div class="next-action-meta">${escHtml(a.goalTitle)} › ${escHtml(a.strategyTitle)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:11px;font-weight:600;color:${daysColor}">${daysText}</div>
        <div style="font-size:10px;color:var(--text3)">${a.deadline}</div>
      </div>
    </div>`;
  }).join('');
}

async function renderUpcomingGoals() {
  const el = document.getElementById('upcoming-goals');
  const goals = await getUpcomingGoals(3);
  if (goals.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">目標を設定しましょう</div></div>';
    return;
  }
  el.innerHTML = goals.map(g => {
    const days = getDaysUntil(g.deadline);
    const daysText = days < 0 ? `${Math.abs(days)}日超過` : days === 0 ? '今日' : `あと${days}日`;
    const daysColor = days < 0 ? 'var(--warning)' : days <= 7 ? 'var(--warning)' : 'var(--text3)';
    return `
      <div class="next-action-item" onclick="openGoalDetail(${g.id})">
        <div class="next-action-dot" style="background:var(--accent)"></div>
        <div class="next-action-body">
          <div class="next-action-title">${escHtml(g.title)}</div>
          <div class="next-action-meta" style="color:${daysColor}">${daysText}・${g.deadline}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ════════════════════════════════
// RECORD MODAL
// ════════════════════════════════
let recordDate = '';
let recordData = {};
let recordChanged = false;

function createEmptyRecord(date) {
  return {
    date,
    shin_kokoro: null, shin_karada: null, shin_atarashii: null,
    relation_aisatsu: null, relation_renraku: null, relation_au: null,
    sleep_kishou: null, sleep_shushin: null, sleep_jikan: null,
    body_aruku: null, body_kintore: null, body_stretch: null, body_supli: null, body_kouryuu: null,
    life_dokusho: null, life_eigo: null, life_sumaho: null, life_tv: null, life_shumi: null,
  };
}

function openRecordModal(date) {
  recordDate = date || todayStr();
  loadRecordData(recordDate);
  document.getElementById('record-modal').classList.add('open');
}

function closeRecordModal() {
  if (recordChanged) {
    if (confirm('変更を保存しますか？')) {
      saveRecordData();
      return;
    }
  }
  document.getElementById('record-modal').classList.remove('open');
}

async function loadRecordData(date) {
  recordDate = date;
  const existing = await getRecord(date);
  recordData = existing || createEmptyRecord(date);
  recordChanged = false;
  renderRecordModal();
}

function renderRecordModal() {
  const isToday = recordDate === todayStr();
  document.getElementById('record-date-text').innerHTML =
    `${formatJapaneseDate(recordDate)}（${getWeekdayJa(recordDate)}）${isToday ? '<div class="today-dot"></div>' : ''}`;

  const body = document.getElementById('record-body');
  body.innerHTML = CATEGORIES.map(cat => {
    const items = cat.items.map(item => {
      let input = '';
      if (item.type === 'number') {
        const val = recordData[item.key];
        input = `
          <div class="number-slider">
            <input type="range" min="${item.min}" max="${item.max}" step="1"
              value="${val ?? Math.floor((item.max - item.min) / 2)}"
              oninput="updateRecordField('${item.key}', Number(this.value))"
              ${val === null ? 'class="inactive"' : ''}>
            <div class="number-value" id="rv-${item.key}">${val ?? '-'}</div>
          </div>`;
      } else if (item.type === 'hours') {
        const val = recordData[item.key];
        const step = item.step || 0.5;
        input = `
          <div class="number-slider">
            <input type="range" min="${item.min}" max="${item.max}" step="${step}"
              value="${val ?? 6}"
              oninput="updateRecordField('${item.key}', Number(this.value))"
              ${val === null ? 'class="inactive"' : ''}>
            <div class="number-value" id="rv-${item.key}">${val ?? '-'}</div>
            <div class="number-unit">時間</div>
          </div>`;
      } else if (item.type === 'rating') {
        const val = recordData[item.key];
        const ratings = ['◎', '〇', '△', '✕'];
        const classes = ['excellent', 'good', 'fair', 'poor'];
        input = `<div class="rating-selector">` +
          ratings.map((r, i) => `
            <button class="rating-btn ${val === r ? 'selected-' + classes[i] : ''}"
              onclick="updateRecordField('${item.key}', '${r}')">${r}</button>
          `).join('') + `</div>`;
      }
      return `<div class="record-item">
        <div class="record-item-label">${item.label}</div>
        <div class="record-item-input">${input}</div>
      </div>`;
    }).join('');

    return `
      <div class="record-category">
        <div class="record-cat-header">
          <div class="record-cat-icon" style="background:${cat.color}18">${cat.icon}</div>
          <div>
            <div class="record-cat-title" style="color:${cat.color}">${cat.label}</div>
            <div class="record-cat-sub">${cat.labelEn}</div>
          </div>
        </div>
        ${items}
      </div>`;
  }).join('');
}

function updateRecordField(key, value) {
  // Toggle rating if same value tapped
  if (typeof value === 'string' && recordData[key] === value) {
    recordData[key] = null;
  } else {
    recordData[key] = value;
  }
  recordChanged = true;
  // Update display
  const valEl = document.getElementById('rv-' + key);
  if (valEl) valEl.textContent = recordData[key] ?? '-';
  // Re-render rating buttons
  renderRecordModal();
}

async function saveRecordData() {
  try {
    await saveRecord({ ...recordData, date: recordDate });
    recordChanged = false;
    document.getElementById('record-modal').classList.remove('open');
    if (currentPage === 'home') loadHomePage();
    if (currentPage === 'calendar') loadCalendarPage();
    if (currentPage === 'stats') loadStatsPage();
  } catch (e) {
    alert('保存に失敗しました: ' + e.message);
  }
}

function recordGoDay(offset) {
  if (recordChanged) {
    if (confirm('変更を保存してから移動しますか？\n「OK」で保存、「キャンセル」で破棄')) {
      saveRecord({ ...recordData, date: recordDate }).then(() => {
        loadRecordData(shiftDate(recordDate, offset));
      });
      return;
    }
  }
  loadRecordData(shiftDate(recordDate, offset));
}

// ════════════════════════════════
// CALENDAR PAGE
// ════════════════════════════════
async function loadCalendarPage() {
  document.getElementById('calendar-month-label').textContent = `${calendarYear}年${calendarMonth}月`;
  const records = await getRecordsForMonth(calendarYear, calendarMonth);
  const recordMap = {};
  records.forEach(r => { recordMap[r.date] = r; });
  renderCalendarGrid(recordMap);
}

function renderCalendarGrid(recordMap) {
  const grid = document.getElementById('calendar-grid');
  const daysInMonth = getMonthDays(calendarYear, calendarMonth);
  const firstDay = getFirstDayOfWeek(calendarYear, calendarMonth);
  const today = todayStr();

  let html = WEEKDAYS_JA.map(w => `<div class="calendar-weekday">${w}</div>`).join('');

  // Empty cells
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const record = recordMap[dateStr];
    const score = calculateDayScore(record);
    let scoreClass = 'score-none';
    if (score !== null) {
      if (score >= 75) scoreClass = 'score-excellent';
      else if (score >= 50) scoreClass = 'score-good';
      else if (score >= 25) scoreClass = 'score-fair';
      else scoreClass = 'score-poor';
    }
    const todayClass = dateStr === today ? 'today' : '';
    const hasRecord = record && isRecordFilled(record);
    html += `<div class="calendar-day ${scoreClass} ${todayClass} ${hasRecord ? 'has-record' : ''}"
      onclick="openRecordModal('${dateStr}')">${d}</div>`;
  }

  grid.innerHTML = html;
}

function calendarPrev() {
  calendarMonth--;
  if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
  loadCalendarPage();
}

function calendarNext() {
  calendarMonth++;
  if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
  loadCalendarPage();
}

// ════════════════════════════════
// STATS PAGE
// ════════════════════════════════
let statsPeriod = '7d';

async function loadStatsPage() {
  const now = new Date();
  let startDate;
  if (statsPeriod === '7d') {
    startDate = new Date(now); startDate.setDate(startDate.getDate() - 6);
  } else if (statsPeriod === '30d') {
    startDate = new Date(now); startDate.setDate(startDate.getDate() - 29);
  } else {
    startDate = new Date(now); startDate.setDate(startDate.getDate() - 89);
  }

  const records = await getRecordsForRange(formatDate(startDate), formatDate(now));
  renderStatsSummary(records);
  renderStatsBars(records);
}

function setStatsPeriod(period) {
  statsPeriod = period;
  document.querySelectorAll('.stats-period-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.period === period);
  });
  loadStatsPage();
}

function renderStatsSummary(records) {
  const el = document.getElementById('stats-summary');
  const filled = records.filter(r => isRecordFilled(r));
  const scores = filled.map(r => calculateDayScore(r)).filter(s => s !== null);
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '-';
  const best = scores.length > 0 ? Math.round(Math.max(...scores)) : '-';
  const streak = calcStreak(records);

  el.innerHTML = `
    <div class="stats-summary-card">
      <div class="stats-summary-value">${avg}${typeof avg === 'number' ? '%' : ''}</div>
      <div class="stats-summary-label">平均スコア</div>
    </div>
    <div class="stats-summary-card">
      <div class="stats-summary-value">${filled.length}<span style="font-size:14px">日</span></div>
      <div class="stats-summary-label">記録日数</div>
    </div>
    <div class="stats-summary-card">
      <div class="stats-summary-value">${best}${typeof best === 'number' ? '%' : ''}</div>
      <div class="stats-summary-label">最高スコア</div>
    </div>
    <div class="stats-summary-card">
      <div class="stats-summary-value">${streak}<span style="font-size:14px">日</span></div>
      <div class="stats-summary-label">連続記録</div>
    </div>
  `;
}

function calcStreak(records) {
  const dates = records.filter(r => isRecordFilled(r)).map(r => r.date).sort().reverse();
  if (dates.length === 0) return 0;
  let streak = 0;
  let check = todayStr();
  for (let i = 0; i < 365; i++) {
    if (dates.includes(check)) {
      streak++;
      check = shiftDate(check, -1);
    } else {
      break;
    }
  }
  return streak;
}

function renderStatsBars(records) {
  const el = document.getElementById('stats-bars');
  const catStats = CATEGORIES.map(cat => {
    let sum = 0, count = 0;
    records.forEach(r => {
      cat.items.forEach(item => {
        const v = r[item.key];
        if (v === null || v === undefined) return;
        if (item.type === 'rating') {
          const s = RATING_SCORE[v];
          if (s !== undefined) { sum += (s / 3) * 100; count++; }
        } else if (item.type === 'number') {
          sum += (v / item.max) * 100; count++;
        } else if (item.type === 'hours') {
          const s = v >= 7 && v <= 8 ? 100 : v >= 6 ? 66 : v >= 5 ? 33 : 0;
          sum += s; count++;
        }
      });
    });
    const avg = count > 0 ? Math.round(sum / count) : 0;
    return { label: cat.label, color: cat.color, avg };
  });

  el.innerHTML = catStats.map(cs => `
    <div class="stats-bar-row">
      <div class="stats-bar-label">${cs.label}</div>
      <div class="stats-bar-track">
        <div class="stats-bar-fill" style="width:${cs.avg}%;background:${cs.color}">${cs.avg > 15 ? cs.avg + '%' : ''}</div>
      </div>
    </div>
  `).join('');
}

// ════════════════════════════════
// GOALS PAGE
// ════════════════════════════════
async function loadGoalsPage() {
  const categories = await getCategories();
  const goals = await getAllGoals();
  const el = document.getElementById('goals-list');

  // Group by category
  const grouped = {};
  const uncategorized = [];
  goals.forEach(g => {
    if (g.category_id) {
      if (!grouped[g.category_id]) grouped[g.category_id] = [];
      grouped[g.category_id].push(g);
    } else {
      uncategorized.push(g);
    }
  });

  let html = '';
  for (const cat of categories) {
    const catGoals = grouped[cat.id] || [];
    if (catGoals.length === 0) continue;
    html += `
      <div class="goal-cat-section">
        <div class="goal-cat-header">
          <div class="goal-cat-badge" style="background:${cat.color}20">${cat.icon}</div>
          <div class="goal-cat-name" style="color:${cat.color}">${cat.name}</div>
        </div>
        ${catGoals.map(g => renderGoalCard(g)).join('')}
      </div>`;
  }

  if (uncategorized.length > 0) {
    html += `<div class="goal-cat-section">
      <div class="goal-cat-header">
        <div class="goal-cat-badge" style="background:var(--border)">📌</div>
        <div class="goal-cat-name">未分類</div>
      </div>
      ${uncategorized.map(g => renderGoalCard(g)).join('')}
    </div>`;
  }

  if (goals.length === 0) {
    html = '<div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-text">目標を追加しましょう</div></div>';
  }

  html += `<button class="goal-add-btn" onclick="openGoalNew()">＋ 新しい目標を追加</button>`;
  el.innerHTML = html;
}

function renderGoalCard(g) {
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="${i < g.importance ? 'star' : 'star-empty'}">${i < g.importance ? '★' : '☆'}</span>`
  ).join('');
  const days = getDaysUntil(g.deadline);
  const daysText = days < 0 ? `${Math.abs(days)}日超過` : days === 0 ? '今日' : `あと${days}日`;

  return `
    <div class="goal-card" onclick="openGoalDetail(${g.id})">
      <div class="goal-card-body">
        <div class="goal-card-title">${escHtml(g.title)}</div>
        <div class="goal-importance">${stars}</div>
        <div class="goal-card-deadline">${daysText}・${g.deadline}</div>
      </div>
      <span class="status-badge status-${g.status}">${statusLabel(g.status)}</span>
    </div>`;
}

function statusLabel(s) {
  const m = { not_started: '未着手', in_progress: '進行中', completed: '完了', on_hold: '保留' };
  return m[s] || s;
}

// ════════════════════════════════
// GOAL NEW MODAL
// ════════════════════════════════
let newGoalData = { category_id: null, title: '', importance: 3, memo: '', precision: 'day' };
let newGoalYear, newGoalMonth, newGoalDay;

async function openGoalNew() {
  const now = new Date();
  newGoalYear = now.getFullYear();
  newGoalMonth = now.getMonth() + 1;
  newGoalDay = now.getDate();
  newGoalData = { category_id: null, title: '', importance: 3, memo: '', precision: 'day' };
  const categories = await getCategories();
  renderGoalNewModal(categories);
  document.getElementById('goal-new-modal').classList.add('open');
}

function closeGoalNew() {
  document.getElementById('goal-new-modal').classList.remove('open');
}

function renderGoalNewModal(categories) {
  const body = document.getElementById('goal-new-body');

  // Category chips
  const catChips = categories.map(c => {
    const selected = newGoalData.category_id === c.id;
    return `<button class="cat-chip ${selected ? 'selected' : ''}"
      style="${selected ? `background:${c.color};border-color:${c.color};color:#FFF` : ''}"
      onclick="newGoalSetCat(${c.id})">
      <div class="cat-chip-icon" style="background:${selected ? 'rgba(255,255,255,0.2)' : c.color + '20'}">${c.icon}</div>
      ${c.name}
    </button>`;
  }).join('');

  // Star rating
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<button class="star-btn ${i < newGoalData.importance ? 'filled' : ''}" onclick="newGoalSetImportance(${i + 1})">${i < newGoalData.importance ? '★' : '☆'}</button>`
  ).join('');

  // Precision tabs
  const precTabs = [
    { key: 'year', label: '年' },
    { key: 'month', label: '月' },
    { key: 'day', label: '日' },
  ].map(t => `
    <button class="precision-tab ${newGoalData.precision === t.key ? 'active' : ''}"
      onclick="newGoalSetPrecision('${t.key}')">${t.label}まで</button>
  `).join('');

  // Date wheel
  const showMonth = newGoalData.precision !== 'year';
  const showDay = newGoalData.precision === 'day';
  const daysInMonth = getMonthDays(newGoalYear, newGoalMonth);
  if (newGoalDay > daysInMonth) newGoalDay = daysInMonth;

  const yearItems = [];
  for (let y = 2024; y <= 2035; y++) yearItems.push(y);
  const monthItems = [];
  for (let m = 1; m <= 12; m++) monthItems.push(m);
  const dayItems = [];
  for (let d = 1; d <= daysInMonth; d++) dayItems.push(d);

  const yearWheel = buildWheelCol('wheel-year', yearItems, newGoalYear, '年');
  const monthWheel = showMonth ? buildWheelCol('wheel-month', monthItems, newGoalMonth, '月') : '';
  const dayWheel = showDay ? buildWheelCol('wheel-day', dayItems, newGoalDay, '日') : '';

  body.innerHTML = `
    <div class="form-section">
      <div class="form-label">📁 カテゴリ</div>
      <div class="cat-chips">${catChips}</div>
    </div>
    <div class="form-section">
      <div class="form-label">🚩 タイトル</div>
      <input class="form-input" id="goal-new-title" value="${escAttr(newGoalData.title)}" placeholder="例: 転職する" oninput="newGoalData.title=this.value">
    </div>
    <div class="form-section">
      <div class="form-label">⭐ 重要度</div>
      <div class="star-rating">${stars}</div>
    </div>
    <div class="form-section">
      <div class="form-label">📅 期限</div>
      <div class="precision-tabs">${precTabs}</div>
      <div class="wheel-container">
        ${yearWheel}${monthWheel}${dayWheel}
      </div>
      <div id="precision-hint" class="precision-hint">${newGoalData.precision === 'year' ? newGoalYear + '年末まで' : newGoalData.precision === 'month' ? newGoalYear + '年' + newGoalMonth + '月末まで' : ''}</div>
    </div>
    <div class="form-section">
      <div class="form-label">📝 メモ</div>
      <textarea class="form-input form-textarea" id="goal-new-memo" placeholder="目標の詳細やメモ" oninput="newGoalData.memo=this.value">${escHtml(newGoalData.memo)}</textarea>
    </div>
  `;

  // Init wheels after DOM is rendered
  requestAnimationFrame(() => {
    initWheel('wheel-year', yearItems, newGoalYear, v => {
      newGoalYear = v;
      updatePrecisionHint();
      // Refresh day wheel if month days changed
      if (showDay) refreshDayWheel();
    });
    if (showMonth) {
      initWheel('wheel-month', monthItems, newGoalMonth, v => {
        newGoalMonth = v;
        updatePrecisionHint();
        if (showDay) refreshDayWheel();
      });
    }
    if (showDay) {
      initWheel('wheel-day', dayItems, newGoalDay, v => { newGoalDay = v; });
    }
  });
}

function updatePrecisionHint() {
  const hintEl = document.getElementById('precision-hint');
  if (!hintEl) return;
  if (newGoalData.precision === 'year') hintEl.textContent = newGoalYear + '年末まで';
  else if (newGoalData.precision === 'month') hintEl.textContent = newGoalYear + '年' + newGoalMonth + '月末まで';
  else hintEl.textContent = '';
}

function refreshDayWheel() {
  const max = getMonthDays(newGoalYear, newGoalMonth);
  if (newGoalDay > max) newGoalDay = max;
  const el = document.getElementById('wheel-day');
  if (!el) return;
  const dayItems = [];
  for (let d = 1; d <= max; d++) dayItems.push(d);
  const spacer = '<div class="wheel-item" style="visibility:hidden">&nbsp;</div>';
  el.innerHTML = spacer + dayItems.map(v =>
    `<div class="wheel-item${v === newGoalDay ? ' selected' : ''}" data-val="${v}">${v}<span class="wheel-unit">日</span></div>`
  ).join('') + spacer;
  el.scrollTop = (newGoalDay - 1) * 40;
  initWheel('wheel-day', dayItems, newGoalDay, v => { newGoalDay = v; });
}

// ── Scroll Wheel helpers ──
function buildWheelCol(id, items, selectedValue, unit) {
  const itemsHtml = items.map(v => {
    const sel = v === selectedValue;
    return `<div class="wheel-item${sel ? ' selected' : ''}" data-val="${v}">${v}<span class="wheel-unit">${unit}</span></div>`;
  }).join('');
  // One blank spacer top + bottom so selected item can be in the highlight zone
  const spacer = '<div class="wheel-item" style="visibility:hidden">&nbsp;</div>';
  return `<div class="wheel-col">
    <div class="wheel-highlight"></div>
    <div class="wheel-scroll" id="${id}">${spacer}${itemsHtml}${spacer}</div>
  </div>`;
}

function initWheel(scrollId, items, selectedValue, onChange) {
  const el = document.getElementById(scrollId);
  if (!el) return;
  const idx = items.indexOf(selectedValue);
  if (idx >= 0) {
    el.scrollTop = idx * 40;
  }
  let timer = null;
  const handler = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const snapIdx = Math.round(el.scrollTop / 40);
      const clamped = Math.max(0, Math.min(snapIdx, items.length - 1));
      // Update selected styling
      el.querySelectorAll('.wheel-item[data-val]').forEach((item, i) => {
        item.classList.toggle('selected', i === clamped);
      });
      onChange(items[clamped]);
    }, 80);
  };
  el.addEventListener('scroll', handler, { passive: true });
}

async function newGoalSetCat(id) {
  newGoalData.category_id = newGoalData.category_id === id ? null : id;
  const categories = await getCategories();
  renderGoalNewModal(categories);
}

function newGoalSetImportance(v) {
  newGoalData.importance = v;
  getCategories().then(cats => renderGoalNewModal(cats));
}

function newGoalSetPrecision(p) {
  newGoalData.precision = p;
  getCategories().then(cats => renderGoalNewModal(cats));
}

async function saveGoalNew() {
  const title = document.getElementById('goal-new-title')?.value?.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  const deadline = buildDeadline(newGoalYear, newGoalMonth, newGoalDay, newGoalData.precision);
  try {
    await createGoal({
      category_id: newGoalData.category_id,
      title,
      deadline,
      importance: newGoalData.importance,
      status: 'not_started',
      memo: newGoalData.memo?.trim() || '',
    });
    closeGoalNew();
    if (currentPage === 'goals') loadGoalsPage();
    if (currentPage === 'home') loadHomePage();
  } catch (e) {
    alert('保存に失敗しました: ' + e.message);
  }
}

// ════════════════════════════════
// GOAL DETAIL MODAL (editable)
// ════════════════════════════════
let detailGoalId = null;
let detailEditing = false;
let showAddStrategyForm = false;
let showAddStepFormFor = null; // strategyId or null
let editStrategyId = null;
let editStepId = null;

async function openGoalDetail(id) {
  detailGoalId = id;
  detailEditing = false;
  showAddStrategyForm = false;
  showAddStepFormFor = null;
  editStrategyId = null;
  editStepId = null;
  await renderGoalDetail();
  document.getElementById('goal-detail-modal').classList.add('open');
}

function closeGoalDetail() {
  document.getElementById('goal-detail-modal').classList.remove('open');
}

async function renderGoalDetail() {
  const goal = await getGoal(detailGoalId);
  if (!goal) return;
  const categories = await getCategories();
  const cat = categories.find(c => c.id === goal.category_id);
  const strategies = await getStrategies(goal.id);
  const progress = await getGoalProgress(goal.id);
  const body = document.getElementById('goal-detail-body');

  // Toggle header save button visibility
  const saveBtn = document.getElementById('goal-detail-save-btn');
  const spacer = document.getElementById('goal-detail-spacer');
  if (saveBtn && spacer) {
    saveBtn.style.display = detailEditing ? '' : 'none';
    spacer.style.display = detailEditing ? 'none' : '';
  }

  // ── Goal info section (view or edit) ──
  let goalInfoHtml;
  if (detailEditing) {
    const catChips = categories.map(c => {
      const sel = goal.category_id === c.id;
      return `<button class="cat-chip ${sel ? 'selected' : ''}"
        style="${sel ? `background:${c.color};border-color:${c.color};color:#FFF` : ''}"
        onclick="detailSetCat(${c.id})">
        <div class="cat-chip-icon" style="background:${sel ? 'rgba(255,255,255,0.2)' : c.color + '20'}">${c.icon}</div>
        ${c.name}</button>`;
    }).join('');
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<button class="star-btn ${i < goal.importance ? 'filled' : ''}" onclick="detailSetImportance(${i + 1})" style="font-size:24px">${i < goal.importance ? '★' : '☆'}</button>`
    ).join('');

    goalInfoHtml = `
      <div class="goal-detail-section">
        <div class="form-section">
          <div class="form-label">📁 カテゴリ</div>
          <div class="cat-chips">${catChips}</div>
        </div>
        <div class="goal-edit-row">
          <label>タイトル</label>
          <input id="detail-edit-title" value="${escAttr(goal.title)}">
        </div>
        <div class="goal-edit-row">
          <label>重要度</label>
          <div style="display:flex;gap:4px">${stars}</div>
        </div>
        <div class="goal-edit-row">
          <label>期限</label>
          <input id="detail-edit-deadline" type="date" value="${goal.deadline}">
        </div>
        <div class="goal-edit-row">
          <label>ステータス</label>
          <select id="detail-edit-status">
            <option value="not_started" ${goal.status === 'not_started' ? 'selected' : ''}>未着手</option>
            <option value="in_progress" ${goal.status === 'in_progress' ? 'selected' : ''}>進行中</option>
            <option value="completed" ${goal.status === 'completed' ? 'selected' : ''}>完了</option>
            <option value="on_hold" ${goal.status === 'on_hold' ? 'selected' : ''}>保留</option>
          </select>
        </div>
        <div class="goal-edit-row" style="align-items:flex-start">
          <label style="margin-top:8px">メモ</label>
          <textarea id="detail-edit-memo" rows="3" style="min-height:60px">${escHtml(goal.memo || '')}</textarea>
        </div>
        <div class="goal-edit-actions">
          <button class="btn-cancel" onclick="detailEditing=false;renderGoalDetail()">キャンセル</button>
          <button class="btn-confirm" onclick="saveGoalEdit()">保存</button>
        </div>
      </div>`;
  } else {
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<span style="color:${i < goal.importance ? 'var(--star)' : 'var(--star-empty)'}; font-size:14px">${i < goal.importance ? '★' : '☆'}</span>`
    ).join('');
    const days = getDaysUntil(goal.deadline);
    const daysText = days < 0 ? `${Math.abs(days)}日超過` : days === 0 ? '今日' : `あと${days}日`;

    goalInfoHtml = `
      <div class="goal-detail-section">
        ${cat ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <div class="goal-cat-badge" style="background:${cat.color}20">${cat.icon}</div>
          <span style="font-size:13px;color:${cat.color};font-weight:600">${cat.name}</span>
        </div>` : ''}
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">${escHtml(goal.title)}</h2>
        <div style="margin-bottom:8px">${stars}</div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:4px">期限: ${goal.deadline}（${daysText}）</div>
        <div style="margin-bottom:8px"><span class="status-badge status-${goal.status}">${statusLabel(goal.status)}</span></div>
        ${goal.memo ? `<div style="font-size:13px;color:var(--text2);padding:10px;background:var(--bg);border-radius:10px;margin-bottom:8px">${escHtml(goal.memo)}</div>` : ''}
        ${progress.total > 0 ? `<div style="font-size:12px;color:var(--text2)">進捗: ${progress.completed}/${progress.total} (${progress.percent}%)</div>
          <div class="stats-bar-track" style="margin-top:6px"><div class="stats-bar-fill" style="width:${progress.percent}%;background:var(--accent)">${progress.percent}%</div></div>` : ''}
        <button onclick="detailEditing=true;renderGoalDetail()" style="margin-top:12px;color:var(--accent);font-size:13px;font-weight:600">✏️ 編集する</button>
      </div>`;
  }

  // ── Strategies & Steps ──
  let strategiesHtml = '';
  for (const s of strategies) {
    const steps = await getSteps(s.id);
    const sProgress = await getStrategyProgress(s.id);

    // Strategy header (editable or view)
    let sHeaderHtml;
    if (editStrategyId === s.id) {
      sHeaderHtml = `
        <div class="inline-add-form" style="margin-bottom:10px">
          <div class="form-row"><div class="form-row-label">タイトル</div>
            <input id="edit-strategy-title" value="${escAttr(s.title)}"></div>
          <div class="form-row"><div class="form-row-label">期限</div>
            <input id="edit-strategy-deadline" type="date" value="${s.deadline}"></div>
          <div class="form-row"><div class="form-row-label">メモ</div>
            <textarea id="edit-strategy-memo">${escHtml(s.memo || '')}</textarea></div>
          <div class="inline-form-actions">
            <button class="btn-cancel" onclick="editStrategyId=null;renderGoalDetail()">キャンセル</button>
            <button class="btn-confirm" onclick="saveStrategyEdit(${s.id})">保存</button>
          </div>
        </div>`;
    } else {
      sHeaderHtml = `
        <div class="strategy-header">
          <div class="strategy-title">${escHtml(s.title)}</div>
          <div style="display:flex;gap:8px">
            <button onclick="editStrategyId=${s.id};renderGoalDetail()" style="color:var(--accent);font-size:12px;font-weight:600">編集</button>
            <button onclick="deleteStrategyAction(${s.id})" style="color:var(--warning);font-size:12px">削除</button>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          期限: ${s.deadline} ・ ${sProgress.completed}/${sProgress.total}完了
          ${s.memo ? ` ・ ${escHtml(s.memo)}` : ''}
        </div>`;
    }

    // Steps
    const stepsHtml = steps.map(st => {
      if (editStepId === st.id) {
        return `
          <div class="inline-add-form" style="margin:8px 0">
            <div class="form-row"><div class="form-row-label">タイトル</div>
              <input id="edit-step-title" value="${escAttr(st.title)}"></div>
            <div class="form-row"><div class="form-row-label">期限</div>
              <input id="edit-step-deadline" type="date" value="${st.deadline}"></div>
            <div class="inline-form-actions">
              <button class="btn-cancel" onclick="editStepId=null;renderGoalDetail()">キャンセル</button>
              <button class="btn-confirm" onclick="saveStepEdit(${st.id})">保存</button>
            </div>
          </div>`;
      }
      return `
        <div class="step-item">
          <button class="step-checkbox ${st.status === 'completed' ? 'completed' : ''}"
            onclick="toggleStep(${st.id})">${st.status === 'completed' ? '✓' : ''}</button>
          <span class="step-title ${st.status === 'completed' ? 'completed' : ''}"
            onclick="editStepId=${st.id};renderGoalDetail()"
            style="cursor:pointer">${escHtml(st.title)}</span>
          <span style="font-size:10px;color:var(--text3);white-space:nowrap">${st.deadline}</span>
          <button onclick="deleteStepAction(${st.id})" style="color:var(--text3);font-size:12px">✕</button>
        </div>`;
    }).join('');

    // Add step form
    let addStepHtml = '';
    if (showAddStepFormFor === s.id) {
      addStepHtml = `
        <div class="inline-add-form">
          <div class="form-row"><div class="form-row-label">ステップのタイトル</div>
            <input id="new-step-title" placeholder="例: 資料を作成する"></div>
          <div class="form-row"><div class="form-row-label">期限</div>
            <input id="new-step-deadline" type="date" value="${todayStr()}"></div>
          <div class="inline-form-actions">
            <button class="btn-cancel" onclick="showAddStepFormFor=null;renderGoalDetail()">キャンセル</button>
            <button class="btn-confirm" onclick="saveNewStep(${s.id})">追加</button>
          </div>
        </div>`;
    } else {
      addStepHtml = `<button class="add-btn-small" onclick="showAddStepFormFor=${s.id};showAddStrategyForm=false;editStepId=null;renderGoalDetail()">＋ ステップ追加</button>`;
    }

    strategiesHtml += `
      <div class="strategy-card">
        ${sHeaderHtml}
        ${stepsHtml}
        ${addStepHtml}
      </div>`;
  }

  // Add strategy form
  let addStrategyHtml = '';
  if (showAddStrategyForm) {
    addStrategyHtml = `
      <div class="inline-add-form" style="margin-top:10px">
        <div class="form-row"><div class="form-row-label">戦略のタイトル</div>
          <input id="new-strategy-title" placeholder="例: スキルアップ計画"></div>
        <div class="form-row"><div class="form-row-label">期限</div>
          <input id="new-strategy-deadline" type="date" value="${todayStr()}"></div>
        <div class="form-row"><div class="form-row-label">メモ（任意）</div>
          <textarea id="new-strategy-memo" placeholder="戦略の詳細"></textarea></div>
        <div class="inline-form-actions">
          <button class="btn-cancel" onclick="showAddStrategyForm=false;renderGoalDetail()">キャンセル</button>
          <button class="btn-confirm" onclick="saveNewStrategy(${goal.id})">追加</button>
        </div>
      </div>`;
  } else {
    addStrategyHtml = `<button class="add-btn-small" onclick="showAddStrategyForm=true;showAddStepFormFor=null;editStrategyId=null;renderGoalDetail()" style="margin-top:8px">＋ 戦略を追加</button>`;
  }

  body.innerHTML = `
    ${goalInfoHtml}
    <div class="goal-detail-section">
      <div class="goal-detail-label">📋 戦略 & ステップ</div>
      ${strategiesHtml}
      ${addStrategyHtml}
    </div>
    <button class="delete-btn" onclick="deleteGoalAction(${goal.id})">この目標を削除</button>
  `;
}

// ── Goal edit helpers ──
async function detailSetCat(catId) {
  const goal = await getGoal(detailGoalId);
  if (!goal) return;
  await updateGoal(detailGoalId, { category_id: goal.category_id === catId ? null : catId });
  await renderGoalDetail();
}

async function detailSetImportance(v) {
  await updateGoal(detailGoalId, { importance: v });
  await renderGoalDetail();
}

async function saveGoalEdit() {
  const title = document.getElementById('detail-edit-title')?.value?.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  const deadline = document.getElementById('detail-edit-deadline')?.value;
  const status = document.getElementById('detail-edit-status')?.value;
  const memo = document.getElementById('detail-edit-memo')?.value?.trim() || '';
  await updateGoal(detailGoalId, { title, deadline, status, memo });
  detailEditing = false;
  await renderGoalDetail();
  if (currentPage === 'goals') loadGoalsPage();
  if (currentPage === 'home') loadHomePage();
}

// Called from header save button
async function saveGoalDetailFromHeader() {
  await saveGoalEdit();
}

async function updateGoalStatus(id, status) {
  await updateGoal(id, { status });
  await renderGoalDetail();
}

async function toggleStep(stepId) {
  const store = await getStore('steps', 'readwrite');
  const step = await promisify(store.get(stepId));
  if (!step) return;
  step.status = step.status === 'completed' ? 'not_started' : 'completed';
  await promisify(store.put(step));
  await renderGoalDetail();
}

// ── Strategy CRUD ──
async function saveNewStrategy(goalId) {
  const title = document.getElementById('new-strategy-title')?.value?.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  const deadline = document.getElementById('new-strategy-deadline')?.value || todayStr();
  const memo = document.getElementById('new-strategy-memo')?.value?.trim() || '';
  const strategies = await getStrategies(goalId);
  await createStrategy({ goal_id: goalId, title, deadline, memo, sort_order: strategies.length });
  showAddStrategyForm = false;
  await renderGoalDetail();
}

async function saveStrategyEdit(id) {
  const title = document.getElementById('edit-strategy-title')?.value?.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  const deadline = document.getElementById('edit-strategy-deadline')?.value;
  const memo = document.getElementById('edit-strategy-memo')?.value?.trim() || '';
  await updateStrategy(id, { title, deadline, memo });
  editStrategyId = null;
  await renderGoalDetail();
}

// ── Step CRUD ──
async function saveNewStep(strategyId) {
  const title = document.getElementById('new-step-title')?.value?.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  const deadline = document.getElementById('new-step-deadline')?.value || todayStr();
  const steps = await getSteps(strategyId);
  await createStep({ strategy_id: strategyId, title, deadline, status: 'not_started', memo: '', sort_order: steps.length });
  showAddStepFormFor = null;
  await renderGoalDetail();
}

async function saveStepEdit(id) {
  const title = document.getElementById('edit-step-title')?.value?.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  const deadline = document.getElementById('edit-step-deadline')?.value;
  await updateStep(id, { title, deadline });
  editStepId = null;
  await renderGoalDetail();
}

async function deleteGoalAction(id) {
  if (!confirm('この目標を削除しますか？')) return;
  await deleteGoal(id);
  closeGoalDetail();
  if (currentPage === 'goals') loadGoalsPage();
  if (currentPage === 'home') loadHomePage();
}

async function deleteStrategyAction(id) {
  if (!confirm('この戦略を削除しますか？')) return;
  await deleteStrategy(id);
  await renderGoalDetail();
}

async function deleteStepAction(id) {
  if (!confirm('このステップを削除しますか？')) return;
  await deleteStep(id);
  await renderGoalDetail();
}

// ════════════════════════════════
// SETTINGS PAGE
// ════════════════════════════════
async function exportData() {
  try {
    const records = await getAllRecords();
    const goals = await getAllGoals();
    const categories = await getCategories();
    const data = { records, goals, categories, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `life-measurement-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('エクスポートに失敗しました: ' + e.message);
  }
}

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.records) {
        for (const r of data.records) await saveRecord(r);
      }
      if (data.goals) {
        const store = await getStore('goals', 'readwrite');
        for (const g of data.goals) await promisify(store.put(g));
      }
      alert('インポートが完了しました');
      showPage(currentPage);
    } catch (err) {
      alert('インポートに失敗しました: ' + err.message);
    }
  };
  input.click();
}

// ── Excel Import (Life計測.xlsx) ──
// Sheet structure per monthly sheet (e.g. "2025_12"):
//   Row 1 (idx 1): columns C+ contain Excel serial dates
//   Row 2 (idx 2): weekday names
//   Rows 3-21 (idx 3-21): data rows mapped to record fields
//   Data columns start at C (index 2)

const EXCEL_ROW_MAP = [
  // [excelRowIndex, recordField, type]
  [3, 'shin_kokoro', 'number'],
  [4, 'shin_karada', 'number'],
  [5, 'shin_atarashii', 'number'],
  [6, 'relation_aisatsu', 'rating'],
  [7, 'relation_renraku', 'rating'],
  [8, 'relation_au', 'rating'],
  [9, 'sleep_kishou', 'rating'],
  [10, 'sleep_shushin', 'rating'],
  [11, 'sleep_jikan', 'number'],
  [12, 'body_aruku', 'rating'],
  [13, 'body_kintore', 'rating'],
  [14, 'body_stretch', 'rating'],
  [15, 'body_supli', 'rating'],
  [16, 'body_kouryuu', 'rating'],
  [17, 'life_dokusho', 'rating'],
  [18, 'life_eigo', 'rating'],
  [19, 'life_sumaho', 'rating'],
  [20, 'life_tv', 'rating'],
  [21, 'life_shumi', 'rating'],
];

function excelSerialToDate(serial) {
  // Excel serial date: days since 1899-12-30 (with 1900 leap year bug)
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return formatDate(d);
}

function parseExcelRating(v) {
  if (v === '◎' || v === '〇' || v === '△' || v === '✕') return v;
  // Handle possible full-width characters
  if (v === '○') return '〇';
  if (v === '×') return '✕';
  return null;
}

async function importExcelFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });

      let importCount = 0;
      let skipCount = 0;

      // Process each monthly sheet (format: "YYYY_M" or "YYYY_MM")
      for (const sheetName of wb.SheetNames) {
        // Skip non-monthly sheets
        if (!sheetName.match(/^\d{4}_\d{1,2}$/)) continue;

        const ws = wb.Sheets[sheetName];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

        // Get dates from row 1 (index 1), starting from column C (index 2)
        const dates = [];
        for (let c = 2; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: 1, c })];
          if (cell && typeof cell.v === 'number' && cell.v > 40000) {
            dates.push({ col: c, date: excelSerialToDate(cell.v) });
          }
        }

        // For each date column, read all 19 data rows
        for (const { col, date } of dates) {
          const record = createEmptyRecord(date);
          let hasData = false;

          for (const [rowIdx, field, type] of EXCEL_ROW_MAP) {
            const cell = ws[XLSX.utils.encode_cell({ r: rowIdx, c: col })];
            if (!cell || cell.v === null || cell.v === undefined || cell.v === '') continue;

            if (type === 'number') {
              const num = Number(cell.v);
              if (!isNaN(num)) {
                record[field] = num;
                hasData = true;
              }
            } else if (type === 'rating') {
              const rating = parseExcelRating(String(cell.v));
              if (rating) {
                record[field] = rating;
                hasData = true;
              }
            }
          }

          if (hasData) {
            await saveRecord(record);
            importCount++;
          } else {
            skipCount++;
          }
        }
      }

      alert(`インポート完了！\n${importCount}日分のデータを取り込みました。\n（空の日: ${skipCount}件スキップ）`);
      showPage(currentPage);
    } catch (err) {
      alert('Excelインポートに失敗しました:\n' + err.message);
      console.error(err);
    }
  };
  input.click();
}

// ════════════════════════════════
// UTILITY
// ════════════════════════════════
function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return escHtml(s);
}
