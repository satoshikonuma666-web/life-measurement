// ===== Firebase Sync Layer =====
// Firestore を使った端末間データ同期

// ── Firebase Config (ユーザーが設定) ──
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
let syncListeners = [];

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
        startRealtimeSync();
      } else {
        stopRealtimeSync();
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
    // popup blocked on mobile → try redirect
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
  try {
    await firebaseAuth.signOut();
  } catch (e) {
    console.error('Sign out error:', e);
  }
}

// ── Firestore paths ──
function userDocPath() {
  return `users/${currentUser.uid}`;
}

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
    // Sync each store
    const stores = ['daily_records', 'goal_categories', 'goals', 'strategies', 'steps'];
    for (const storeName of stores) {
      await mergeStore(storeName);
    }
    updateSyncStatus('done');
    // Refresh current page
    if (typeof showPage === 'function') showPage(currentPage);
  } catch (e) {
    console.error('Full sync error:', e);
    updateSyncStatus('error');
  }
}

async function mergeStore(storeName) {
  // Get local data
  const store = await getStore(storeName);
  const localData = await promisify(store.getAll());

  // Get cloud data
  const cloudData = await syncDownloadAll(storeName);

  // Build lookup maps
  const localMap = {};
  localData.forEach(item => {
    const key = getDocId(storeName, item);
    localMap[key] = item;
  });

  const cloudMap = {};
  cloudData.forEach(item => {
    const key = getDocId(storeName, item);
    cloudMap[key] = item;
  });

  // Merge: newer updated_at wins, or cloud if no timestamp
  const toWriteLocal = [];
  const toWriteCloud = [];

  // Check cloud items → local
  for (const [key, cloudItem] of Object.entries(cloudMap)) {
    const localItem = localMap[key];
    if (!localItem) {
      // Cloud only → write to local
      toWriteLocal.push(cloudItem);
    } else {
      // Both exist → compare updated_at
      const cloudTime = cloudItem.updated_at || '';
      const localTime = localItem.updated_at || '';
      if (cloudTime > localTime) {
        toWriteLocal.push(cloudItem);
      } else if (localTime > cloudTime) {
        toWriteCloud.push(localItem);
      }
    }
  }

  // Check local items not in cloud → upload
  for (const [key, localItem] of Object.entries(localMap)) {
    if (!cloudMap[key]) {
      toWriteCloud.push(localItem);
    }
  }

  // Write to local IndexedDB
  if (toWriteLocal.length > 0) {
    const ws = await getStore(storeName, 'readwrite');
    for (const item of toWriteLocal) {
      ws.put(item);
    }
  }

  // Write to cloud
  if (toWriteCloud.length > 0) {
    await syncUpload(storeName, toWriteCloud);
  }
}

// ── Realtime sync listener ──
function startRealtimeSync() {
  stopRealtimeSync();
  if (!syncEnabled || !currentUser) return;
  const stores = ['daily_records', 'goals', 'strategies', 'steps'];
  for (const storeName of stores) {
    const unsub = firebaseDb.collection(collectionPath(storeName))
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data();
            const ws = await getStore(storeName, 'readwrite');
            const existing = await promisify(ws.get(storeName === 'daily_records' ? data.date : data.id));
            // Only update local if cloud is newer
            const cloudTime = data.updated_at || '';
            const localTime = existing?.updated_at || '';
            if (!existing || cloudTime >= localTime) {
              const ws2 = await getStore(storeName, 'readwrite');
              ws2.put(data);
            }
          } else if (change.type === 'removed') {
            const data = change.doc.data();
            const ws = await getStore(storeName, 'readwrite');
            const key = storeName === 'daily_records' ? data.date : data.id;
            ws.delete(key);
          }
        });
        // Refresh UI if on relevant page
        if (typeof showPage === 'function' && typeof currentPage !== 'undefined') {
          showPage(currentPage);
        }
      }, err => {
        console.error('Realtime sync error:', storeName, err);
      });
    syncListeners.push(unsub);
  }
}

function stopRealtimeSync() {
  syncListeners.forEach(unsub => unsub());
  syncListeners = [];
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

// ── Hook into db.js save/delete functions ──
// These are called after local IndexedDB writes to sync to cloud

async function syncAfterSaveRecord(record) {
  await syncUpload('daily_records', record);
}

async function syncAfterSaveGoal(goal) {
  await syncUpload('goals', goal);
}

async function syncAfterDeleteGoal(id) {
  await syncDelete('goals', id);
}

async function syncAfterSaveStrategy(strategy) {
  await syncUpload('strategies', strategy);
}

async function syncAfterDeleteStrategy(id) {
  await syncDelete('strategies', id);
}

async function syncAfterSaveStep(step) {
  await syncUpload('steps', step);
}

async function syncAfterDeleteStep(id) {
  await syncDelete('steps', id);
}
