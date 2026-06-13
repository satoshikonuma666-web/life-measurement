// ===== IndexedDB Layer =====
const DB_NAME = 'life_measurement';
const DB_VERSION = 2;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // daily_records
      if (!db.objectStoreNames.contains('daily_records')) {
        const rs = db.createObjectStore('daily_records', { keyPath: 'date' });
        rs.createIndex('date', 'date', { unique: true });
      }
      // goal_categories
      if (!db.objectStoreNames.contains('goal_categories')) {
        db.createObjectStore('goal_categories', { keyPath: 'id', autoIncrement: true });
      }
      // goals
      if (!db.objectStoreNames.contains('goals')) {
        const gs = db.createObjectStore('goals', { keyPath: 'id', autoIncrement: true });
        gs.createIndex('status', 'status');
        gs.createIndex('category_id', 'category_id');
      }
      // strategies
      if (!db.objectStoreNames.contains('strategies')) {
        const ss = db.createObjectStore('strategies', { keyPath: 'id', autoIncrement: true });
        ss.createIndex('goal_id', 'goal_id');
      }
      // steps
      if (!db.objectStoreNames.contains('steps')) {
        const st = db.createObjectStore('steps', { keyPath: 'id', autoIncrement: true });
        st.createIndex('strategy_id', 'strategy_id');
      }
      // settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Generic helpers ──
async function getStore(storeName, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Daily Records ──
async function getRecord(date) {
  const store = await getStore('daily_records');
  return promisify(store.get(date));
}

async function saveRecord(record) {
  record.updated_at = new Date().toISOString();
  if (!record.created_at) record.created_at = record.updated_at;
  const store = await getStore('daily_records', 'readwrite');
  await promisify(store.put(record));
  if (typeof syncAfterSaveRecord === 'function') syncAfterSaveRecord(record);
}

async function getRecordsForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const store = await getStore('daily_records');
  const all = await promisify(store.getAll());
  return all.filter(r => r.date.startsWith(prefix));
}

async function getRecordsForRange(startDate, endDate) {
  const store = await getStore('daily_records');
  const all = await promisify(store.getAll());
  return all.filter(r => r.date >= startDate && r.date <= endDate);
}

async function getAllRecords() {
  const store = await getStore('daily_records');
  return promisify(store.getAll());
}

// ── Categories ──
const DEFAULT_CATEGORIES = [
  { name: '自分自身', icon: '👤', color: '#C4A882', sort_order: 0 },
  { name: '仕事', icon: '💼', color: '#6B8F71', sort_order: 1 },
  { name: '家族', icon: '👨‍👩‍👧', color: '#7BA0C4', sort_order: 2 },
  { name: 'お金', icon: '💰', color: '#C47B7B', sort_order: 3 },
  { name: '健康', icon: '💪', color: '#A0C47B', sort_order: 4 },
  { name: '学び', icon: '📚', color: '#9B7BC4', sort_order: 5 },
];

async function seedCategories() {
  const store = await getStore('goal_categories', 'readwrite');
  const existing = await promisify(store.getAll());
  if (existing.length > 0) return;
  for (const cat of DEFAULT_CATEGORIES) {
    store.add({ ...cat });
  }
}

async function getCategories() {
  const store = await getStore('goal_categories');
  const cats = await promisify(store.getAll());
  return cats.sort((a, b) => a.sort_order - b.sort_order);
}

async function createCategory(cat) {
  const store = await getStore('goal_categories', 'readwrite');
  return promisify(store.add(cat));
}

// ── Goals ──
async function getAllGoals(filter, categoryId) {
  const store = await getStore('goals');
  let goals = await promisify(store.getAll());
  if (filter && filter !== 'all') {
    goals = goals.filter(g => g.status === filter);
  }
  if (categoryId !== undefined && categoryId !== null) {
    goals = goals.filter(g => g.category_id === categoryId);
  }
  return goals;
}

async function getGoal(id) {
  const store = await getStore('goals');
  return promisify(store.get(id));
}

async function createGoal(goal) {
  goal.created_at = new Date().toISOString();
  goal.updated_at = goal.created_at;
  const store = await getStore('goals', 'readwrite');
  const id = await promisify(store.add(goal));
  goal.id = id;
  if (typeof syncAfterSaveGoal === 'function') syncAfterSaveGoal(goal);
  return id;
}

async function updateGoal(id, updates) {
  const store = await getStore('goals', 'readwrite');
  const goal = await promisify(store.get(id));
  if (!goal) return;
  Object.assign(goal, updates, { updated_at: new Date().toISOString() });
  await promisify(store.put(goal));
  if (typeof syncAfterSaveGoal === 'function') syncAfterSaveGoal(goal);
}

async function deleteGoal(id) {
  // Delete steps and strategies first
  const strategies = await getStrategies(id);
  for (const s of strategies) {
    await deleteStrategy(s.id);
  }
  const store = await getStore('goals', 'readwrite');
  await promisify(store.delete(id));
  if (typeof syncAfterDeleteGoal === 'function') syncAfterDeleteGoal(id);
}

// ── Strategies ──
async function getStrategies(goalId) {
  const store = await getStore('strategies');
  const all = await promisify(store.getAll());
  return all.filter(s => s.goal_id === goalId).sort((a, b) => a.sort_order - b.sort_order);
}

async function createStrategy(strategy) {
  strategy.updated_at = new Date().toISOString();
  const store = await getStore('strategies', 'readwrite');
  const id = await promisify(store.add(strategy));
  strategy.id = id;
  if (typeof syncAfterSaveStrategy === 'function') syncAfterSaveStrategy(strategy);
  return id;
}

async function updateStrategy(id, updates) {
  const store = await getStore('strategies', 'readwrite');
  const s = await promisify(store.get(id));
  if (!s) return;
  Object.assign(s, updates, { updated_at: new Date().toISOString() });
  await promisify(store.put(s));
  if (typeof syncAfterSaveStrategy === 'function') syncAfterSaveStrategy(s);
}

async function deleteStrategy(id) {
  // Delete steps first
  const steps = await getSteps(id);
  const stepStore = await getStore('steps', 'readwrite');
  for (const step of steps) {
    stepStore.delete(step.id);
    if (typeof syncAfterDeleteStep === 'function') syncAfterDeleteStep(step.id);
  }
  const store = await getStore('strategies', 'readwrite');
  await promisify(store.delete(id));
  if (typeof syncAfterDeleteStrategy === 'function') syncAfterDeleteStrategy(id);
}

// ── Steps ──
async function getSteps(strategyId) {
  const store = await getStore('steps');
  const all = await promisify(store.getAll());
  return all.filter(s => s.strategy_id === strategyId).sort((a, b) => a.sort_order - b.sort_order);
}

async function createStep(step) {
  step.updated_at = new Date().toISOString();
  const store = await getStore('steps', 'readwrite');
  const id = await promisify(store.add(step));
  step.id = id;
  if (typeof syncAfterSaveStep === 'function') syncAfterSaveStep(step);
  return id;
}

async function updateStep(id, updates) {
  const store = await getStore('steps', 'readwrite');
  const s = await promisify(store.get(id));
  if (!s) return;
  Object.assign(s, updates, { updated_at: new Date().toISOString() });
  await promisify(store.put(s));
  if (typeof syncAfterSaveStep === 'function') syncAfterSaveStep(s);
}

async function deleteStep(id) {
  const store = await getStore('steps', 'readwrite');
  await promisify(store.delete(id));
  if (typeof syncAfterDeleteStep === 'function') syncAfterDeleteStep(id);
}

// ── Goal Progress ──
async function getGoalProgress(goalId) {
  const strategies = await getStrategies(goalId);
  let total = 0, completed = 0;
  for (const s of strategies) {
    const steps = await getSteps(s.id);
    total += steps.length;
    completed += steps.filter(st => st.status === 'completed').length;
  }
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

async function getStrategyProgress(strategyId) {
  const steps = await getSteps(strategyId);
  const total = steps.length;
  const completed = steps.filter(s => s.status === 'completed').length;
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

// ── Next Actions (for home) ──
async function getNextActions(limit = 5) {
  const goals = await getAllGoals('in_progress');
  const actions = [];
  for (const goal of goals) {
    const strategies = await getStrategies(goal.id);
    for (const strategy of strategies) {
      const steps = await getSteps(strategy.id);
      const nextStep = steps.find(s => s.status !== 'completed');
      if (nextStep) {
        actions.push({
          goalTitle: goal.title,
          strategyTitle: strategy.title,
          stepTitle: nextStep.title,
          stepId: nextStep.id,
          deadline: nextStep.deadline,
          color: '#C4A882',
        });
      }
    }
  }
  return actions.slice(0, limit);
}

// ── Upcoming Goals ──
async function getUpcomingGoals(limit = 3) {
  const goals = await getAllGoals();
  const active = goals.filter(g => g.status !== 'completed');
  active.sort((a, b) => a.deadline.localeCompare(b.deadline));
  return active.slice(0, limit);
}

// ── Scoring ──
const RATING_SCORE = { '◎': 3, '〇': 2, '△': 1, '✕': 0 };

function ratingToScore(v) {
  if (v === null || v === undefined) return null;
  return RATING_SCORE[v] ?? null;
}

function calculateDayScore(record) {
  if (!record) return null;
  let sum = 0, count = 0;

  // 3shin: each 0-10, normalize to 0-3
  ['shin_kokoro', 'shin_karada', 'shin_atarashii'].forEach(k => {
    const v = record[k];
    if (v !== null && v !== undefined) { sum += (v / 10) * 3; count++; }
  });

  // Ratings
  const ratingKeys = [
    'relation_aisatsu', 'relation_renraku', 'relation_au',
    'sleep_kishou', 'sleep_shushin',
    'body_aruku', 'body_kintore', 'body_stretch', 'body_supli', 'body_kouryuu',
    'life_dokusho', 'life_eigo', 'life_sumaho', 'life_tv', 'life_shumi',
  ];
  ratingKeys.forEach(k => {
    const s = ratingToScore(record[k]);
    if (s !== null) { sum += s; count++; }
  });

  // Sleep hours: normalize 7-8h as 3
  if (record.sleep_jikan !== null && record.sleep_jikan !== undefined) {
    const h = record.sleep_jikan;
    const s = h >= 7 && h <= 8 ? 3 : h >= 6 ? 2 : h >= 5 ? 1 : 0;
    sum += s; count++;
  }

  if (count === 0) return null;
  return (sum / count / 3) * 100; // percentage 0-100
}

function isRecordFilled(record) {
  if (!record) return false;
  const keys = [
    'shin_kokoro', 'shin_karada', 'shin_atarashii',
    'relation_aisatsu', 'relation_renraku', 'relation_au',
    'sleep_kishou', 'sleep_shushin', 'sleep_jikan',
    'body_aruku', 'body_kintore', 'body_stretch', 'body_supli', 'body_kouryuu',
    'life_dokusho', 'life_eigo', 'life_sumaho', 'life_tv', 'life_shumi',
  ];
  return keys.some(k => record[k] !== null && record[k] !== undefined);
}

// ── Initialize ──
async function initDB() {
  await openDB();
  await seedCategories();
}
