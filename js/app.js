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
  el.innerHTML = actions.map(a => `
    <div class="next-action-item">
      <div class="next-action-dot" style="background:${a.color}"></div>
      <div class="next-action-body">
        <div class="next-action-title">${escHtml(a.stepTitle)}</div>
        <div class="next-action-meta">${escHtml(a.goalTitle)} › ${escHtml(a.strategyTitle)}</div>
      </div>
    </div>
  `).join('');
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

  // Date wheels
  const yearOptions = renderWheelOptions(newGoalYear - 2, 11, newGoalYear, '年');
  const showMonth = newGoalData.precision !== 'year';
  const showDay = newGoalData.precision === 'day';
  const monthOptions = showMonth ? renderWheelOptions(1, 12, newGoalMonth, '月', true) : '';
  const daysInMonth = getMonthDays(newGoalYear, newGoalMonth);
  const dayOptions = showDay ? renderWheelOptions(1, daysInMonth, Math.min(newGoalDay, daysInMonth), '日', true) : '';

  let precisionHint = '';
  if (newGoalData.precision === 'year') precisionHint = `<div class="precision-hint">${newGoalYear}年末まで</div>`;
  else if (newGoalData.precision === 'month') precisionHint = `<div class="precision-hint">${newGoalYear}年${newGoalMonth}月末まで</div>`;

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
      <div class="date-picker-container">
        <div class="wheel-wrapper" style="width:80px" id="wheel-year">
          <div class="wheel-highlight"></div>
          <div class="wheel-scroll" onscroll="onWheelScroll(this, 'year')">${yearOptions}</div>
        </div>
        ${showMonth ? `<div class="wheel-wrapper" style="width:56px" id="wheel-month">
          <div class="wheel-highlight"></div>
          <div class="wheel-scroll" onscroll="onWheelScroll(this, 'month')">${monthOptions}</div>
        </div>` : ''}
        ${showDay ? `<div class="wheel-wrapper" style="width:56px" id="wheel-day">
          <div class="wheel-highlight"></div>
          <div class="wheel-scroll" onscroll="onWheelScroll(this, 'day')">${dayOptions}</div>
        </div>` : ''}
      </div>
      ${precisionHint}
    </div>
    <div class="form-section">
      <div class="form-label">📝 メモ</div>
      <textarea class="form-input form-textarea" id="goal-new-memo" placeholder="目標の詳細やメモ" oninput="newGoalData.memo=this.value">${escHtml(newGoalData.memo)}</textarea>
    </div>
  `;

  // Scroll wheels to correct position after render
  requestAnimationFrame(() => {
    scrollWheelTo('wheel-year', newGoalYear - (newGoalYear - 2));
    if (showMonth) scrollWheelTo('wheel-month', newGoalMonth - 1);
    if (showDay) scrollWheelTo('wheel-day', Math.min(newGoalDay, daysInMonth) - 1);
  });
}

function renderWheelOptions(start, count, selected, suffix, padZero) {
  let html = '<div style="height:40px"></div>'; // top padding
  for (let i = 0; i < count; i++) {
    const v = start + i;
    const label = padZero ? String(v).padStart(2, '0') : String(v);
    const sel = v === selected ? 'selected' : '';
    html += `<div class="wheel-item ${sel}" data-value="${v}">${label}<span class="wheel-suffix">${v === selected ? suffix : ''}</span></div>`;
  }
  html += '<div style="height:40px"></div>'; // bottom padding
  return html;
}

function scrollWheelTo(wrapperId, index) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;
  const scroll = wrapper.querySelector('.wheel-scroll');
  if (scroll) scroll.scrollTop = index * 40;
}

function onWheelScroll(el, type) {
  const idx = Math.round(el.scrollTop / 40);
  const items = el.querySelectorAll('.wheel-item');
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === idx);
    const suffix = item.querySelector('.wheel-suffix');
    if (suffix) suffix.textContent = i === idx ? (type === 'year' ? '年' : type === 'month' ? '月' : '日') : '';
  });
  const value = items[idx]?.dataset.value;
  if (value === undefined) return;
  if (type === 'year') newGoalYear = Number(value);
  if (type === 'month') newGoalMonth = Number(value);
  if (type === 'day') newGoalDay = Number(value);
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
// GOAL DETAIL MODAL
// ════════════════════════════════
let detailGoalId = null;

async function openGoalDetail(id) {
  detailGoalId = id;
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
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < goal.importance ? 'var(--star)' : 'var(--star-empty)'}; font-size:14px">${i < goal.importance ? '★' : '☆'}</span>`
  ).join('');

  let strategiesHtml = '';
  for (const s of strategies) {
    const steps = await getSteps(s.id);
    const sProgress = await getStrategyProgress(s.id);
    const stepsHtml = steps.map(st => `
      <div class="step-item">
        <button class="step-checkbox ${st.status === 'completed' ? 'completed' : ''}"
          onclick="toggleStep(${st.id})">${st.status === 'completed' ? '✓' : ''}</button>
        <span class="step-title ${st.status === 'completed' ? 'completed' : ''}">${escHtml(st.title)}</span>
        <button onclick="deleteStepAction(${st.id})" style="color:var(--text3);font-size:12px">✕</button>
      </div>
    `).join('');

    strategiesHtml += `
      <div class="strategy-card">
        <div class="strategy-header">
          <div class="strategy-title">${escHtml(s.title)}</div>
          <button onclick="deleteStrategyAction(${s.id})" style="color:var(--warning);font-size:12px">削除</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">期限: ${s.deadline} ・ ${sProgress.completed}/${sProgress.total}完了</div>
        ${stepsHtml}
        <button class="add-btn-small" onclick="addStepPrompt(${s.id})">＋ ステップ追加</button>
      </div>`;
  }

  body.innerHTML = `
    <div class="goal-detail-section">
      ${cat ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div class="goal-cat-badge" style="background:${cat.color}20">${cat.icon}</div>
        <span style="font-size:13px;color:${cat.color};font-weight:600">${cat.name}</span>
      </div>` : ''}
      <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">${escHtml(goal.title)}</h2>
      <div style="margin-bottom:8px">${stars}</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:8px">期限: ${goal.deadline}</div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="font-size:12px;color:var(--text2)">ステータス:</span>
        <select class="status-select" onchange="updateGoalStatus(${goal.id}, this.value)">
          <option value="not_started" ${goal.status === 'not_started' ? 'selected' : ''}>未着手</option>
          <option value="in_progress" ${goal.status === 'in_progress' ? 'selected' : ''}>進行中</option>
          <option value="completed" ${goal.status === 'completed' ? 'selected' : ''}>完了</option>
          <option value="on_hold" ${goal.status === 'on_hold' ? 'selected' : ''}>保留</option>
        </select>
      </div>
      ${goal.memo ? `<div style="font-size:13px;color:var(--text2);padding:10px;background:var(--bg);border-radius:10px">${escHtml(goal.memo)}</div>` : ''}
      ${progress.total > 0 ? `<div style="margin-top:12px;font-size:12px;color:var(--text2)">進捗: ${progress.completed}/${progress.total} (${progress.percent}%)</div>
        <div class="stats-bar-track" style="margin-top:6px"><div class="stats-bar-fill" style="width:${progress.percent}%;background:var(--accent)">${progress.percent}%</div></div>` : ''}
    </div>

    <div class="goal-detail-section">
      <div class="goal-detail-label">📋 戦略 & ステップ</div>
      ${strategiesHtml}
      <button class="add-btn-small" onclick="addStrategyPrompt(${goal.id})" style="margin-top:8px">＋ 戦略を追加</button>
    </div>

    <button class="delete-btn" onclick="deleteGoalAction(${goal.id})">この目標を削除</button>
  `;
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

async function addStrategyPrompt(goalId) {
  const title = prompt('戦略のタイトル:');
  if (!title?.trim()) return;
  const deadline = prompt('期限 (YYYY-MM-DD):', todayStr());
  if (!deadline) return;
  const strategies = await getStrategies(goalId);
  await createStrategy({
    goal_id: goalId,
    title: title.trim(),
    deadline,
    memo: '',
    sort_order: strategies.length,
  });
  await renderGoalDetail();
}

async function addStepPrompt(strategyId) {
  const title = prompt('ステップのタイトル:');
  if (!title?.trim()) return;
  const deadline = prompt('期限 (YYYY-MM-DD):', todayStr());
  if (!deadline) return;
  const steps = await getSteps(strategyId);
  await createStep({
    strategy_id: strategyId,
    title: title.trim(),
    deadline,
    status: 'not_started',
    memo: '',
    sort_order: steps.length,
  });
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

async function importExcel() {
  alert('Excelインポートは現在HTMLバージョンでは対応していません。\nJSONバックアップをご利用ください。');
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
