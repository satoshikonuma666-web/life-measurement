// ===== Firebase Sync Layer =====
// Firestore を使った端末間データ同期（5分間隔バッチ方式）

// ── Firebase Config ──
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDxCcdh9FeVl0zLgV44Eh5n4fSFWGyuEBw",
  authDomain: "life-measurement.firebaseapp.com",
  projectId: "life-measurement",
  storageBucket: "life-measurement.firebasestorage.app",
  messagingSenderId: "713792092808",
  appId: "1:713792092808:web:a65c8cf40e997253b27d3d"
};

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let syncEnabled = false;
let syncTimer = null;
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
let syncDirty = false; // true when local changes need uploading

// ── Initialize Firebase ──
function initFirebase() {
  if (!FIREBASE_CONFIG.apiKey) return false;
  try {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();
    // Enable offline persistence
    firebaseDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    // Listen for auth state changes
    firebaseAuth.onAuthStateChanged(user => {
      currentUser = user;
      syncEnabled = !!user;
      updateSyncUI();
      if (user) {
        startPeriodicSync();
      } else {
        stopPeriodicSync();
      }
    });
    return true;
  } catch (e) {
    console.error('Firebase init error:', e);
    return false;
  }
}

// ── Auth: Google Sign-in ──
async function signInWithGoogle() {
  if (!firebaseAuth) { alert('Firebaseが設定されていません'); return; }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebaseAuth.signInWithPopup(provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request') {
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebaseAuth.signInWithRedirect(provider);
    } else {
      console.error('Sign in error:', e);
      alert('ログインに失敗しました: ' + e.message);
    }
  }
}

async function signOut() {
  if (!firebaseAuth) return;
  // Sync before logout
  if (syncDirty) await fullSync();
  try {
    await firebaseAuth.signOut();
  } catch (e) {
    console.error('Sign out error:', e);
  }
}

// ── Firestore paths ──
function collectionPath(storeName) {
  return `users/${currentUser.uid}/${storeName}`;
}

// ── Upload to Firestore ──
async function syncUpload(storeName, data) {
  if (!syncEnabled || !currentUser) return;
  try {
    const col = firebaseDb.collection(collectionPath(storeName));
    const batch = firebaseDb.batch();
    if (Array.isArray(data)) {
      for (const item of data) {
        const docId = getDocId(storeName, item);
        batch.set(col.doc(docId), JSON.parse(JSON.stringify(item)), { merge: true });
      }
    } else {
      const docId = getDocId(storeName, data);
      batch.set(col.doc(docId), JSON.parse(JSON.stringify(data)), { merge: true });
    }
    await batch.commit();
  } catch (e) {
    console.error('Sync upload error:', storeName, e);
  }
}

async function syncDelete(storeName, id) {
  if (!syncEnabled || !currentUser) return;
  try {
    const docId = String(id);
    await firebaseDb.collection(collectionPath(storeName)).doc(docId).delete();
  } catch (e) {
    console.error('Sync delete error:', storeName, e);
  }
}

function getDocId(storeName, item) {
  if (storeName === 'daily_records') return item.date;
  if (storeName === 'settings') return item.key;
  return String(item.id);
}

// ── Download from Firestore ──
async function syncDownloadAll(storeName) {
  if (!syncEnabled || !currentUser) return [];
  try {
    const snapshot = await firebaseDb.collection(collectionPath(storeName)).get();
    return snapshot.docs.map(doc => doc.data());
  } catch (e) {
    console.error('Sync download error:', storeName, e);
    return [];
  }
}

// ── Full sync (merge cloud ↔ local) ──
async function fullSync() {
  if (!syncEnabled || !currentUser) return;
  updateSyncStatus('syncing');
  try {
    const stores = ['daily_records', 'goal_categories', 'goals', 'strategies', 'steps'];
    for (const storeName of stores) {
      await mergeStore(storeName);
    }
    syncDirty = false;
    updateSyncStatus('done');
  } catch (e) {
    console.error('Full sync error:', e);
    updateSyncStatus('error');
  }
}

async function mergeStore(storeName) {
  const store = await getStore(storeName);
  const localData = await promisify(store.getAll());
  const cloudData = await syncDownloadAll(storeName);

  const localMap = {};
  localData.forEach(item => { localMap[getDocId(storeName, item)] = item; });
  const cloudMap = {};
  cloudData.forEach(item => { cloudMap[getDocId(storeName, item)] = item; });

  const toWriteLocal = [];
  const toWriteCloud = [];

  for (const [key, cloudItem] of Object.entries(cloudMap)) {
    const localItem = localMap[key];
    if (!localItem) {
      toWriteLocal.push(cloudItem);
    } else {
      const cloudTime = cloudItem.updated_at || '';
      const localTime = localItem.updated_at || '';
      if (cloudTime > localTime) {
        toWriteLocal.push(cloudItem);
      } else if (localTime > cloudTime) {
        toWriteCloud.push(localItem);
      }
    }
  }

  for (const [key, localItem] of Object.entries(localMap)) {
    if (!cloudMap[key]) {
      toWriteCloud.push(localItem);
    }
  }

  if (toWriteLocal.length > 0) {
    const ws = await getStore(storeName, 'readwrite');
    for (const item of toWriteLocal) { ws.put(item); }
  }
  if (toWriteCloud.length > 0) {
    await syncUpload(storeName, toWriteCloud);
  }
}

// ── Periodic sync (every 5 minutes) ──
function startPeriodicSync() {
  stopPeriodicSync();
  // Initial sync on login
  fullSync();
  // Then every 5 minutes
  syncTimer = setInterval(() => {
    if (syncDirty) fullSync();
  }, SYNC_INTERVAL);
  // Also sync when app becomes visible (e.g. switching back to tab)
  document.addEventListener('visibilitychange', onVisibilitySync);
  // Sync before page unload
  window.addEventListener('beforeunload', onBeforeUnloadSync);
}

function stopPeriodicSync() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  document.removeEventListener('visibilitychange', onVisibilitySync);
  window.removeEventListener('beforeunload', onBeforeUnloadSync);
}

function onVisibilitySync() {
  if (document.visibilityState === 'visible' && syncEnabled) {
    fullSync();
  }
}

function onBeforeUnloadSync() {
  if (syncDirty && syncEnabled && currentUser) {
    // Best-effort sync before closing
    fullSync();
  }
}

// ── Mark dirty (called from db.js hooks) ──
function markSyncDirty() {
  syncDirty = true;
}

// ── UI helpers ──
function updateSyncUI() {
  const loginBtn = document.getElementById('sync-login-btn');
  const manualBtn = document.getElementById('sync-manual-btn');
  const statusEl = document.getElementById('sync-status');
  const userEl = document.getElementById('sync-user');

  if (loginBtn) {
    if (currentUser) {
      loginBtn.textContent = 'ログアウト';
      loginBtn.onclick = signOut;
    } else {
      loginBtn.textContent = 'Googleでログイン';
      loginBtn.onclick = signInWithGoogle;
    }
  }
  if (manualBtn) {
    manualBtn.style.display = currentUser ? '' : 'none';
  }
  if (userEl) {
    userEl.textContent = currentUser ? currentUser.displayName || currentUser.email : '未ログイン';
  }
  if (statusEl) {
    statusEl.textContent = currentUser ? '同期ON' : '同期OFF';
    statusEl.style.color = currentUser ? 'var(--success)' : 'var(--text3)';
  }
}

function updateSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  if (state === 'syncing') {
    el.textContent = '同期中...';
    el.style.color = 'var(--accent)';
  } else if (state === 'done') {
    el.textContent = '同期完了 ✓';
    el.style.color = 'var(--success)';
    setTimeout(() => {
      if (el.textContent === '同期完了 ✓') {
        el.textContent = '同期ON';
        el.style.color = 'var(--success)';
      }
    }, 3000);
  } else if (state === 'error') {
    el.textContent = '同期エラー';
    el.style.color = 'var(--warning)';
  }
}

// ── Hooks called from db.js ──
// Just mark dirty instead of immediate upload
function syncAfterSaveRecord() { markSyncDirty(); }
function syncAfterSaveGoal() { markSyncDirty(); }
function syncAfterDeleteGoal() { markSyncDirty(); }
function syncAfterSaveStrategy() { markSyncDirty(); }
function syncAfterDeleteStrategy() { markSyncDirty(); }
function syncAfterSaveStep() { markSyncDirty(); }
function syncAfterDeleteStep() { markSyncDirty(); }
