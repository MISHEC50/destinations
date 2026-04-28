// ═══════════════════════════════════════════════════════════════════════════════
//  שאגת הארי – App v2  |  Firebase Firestore + Auth + Real-time + Locks
// ═══════════════════════════════════════════════════════════════════════════════

import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }            from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
import { getFirestore, collection, doc,
         onSnapshot, updateDoc, addDoc, deleteDoc,
         setDoc, getDoc, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';
import { FIREBASE_CONFIG, PREDEFINED_USERS }      from './config.js';

// ─── Init ───────────────────────────────────────────────────────────────────────
const fbApp   = initializeApp(FIREBASE_CONFIG);
const auth    = getAuth(fbApp);
const db      = getFirestore(fbApp);

// ─── Constants ─────────────────────────────────────────────────────────────────
const GRADE_COLORS   = { 'א':'#2980B9','ב':'#27AE60','ג':'#16A085','ד':'#E67E22','ה':'#8E44AD','ו':'#C0392B' };
const GRADE_TILE_ROW = { 'א':'alef','ב':'bet','ג':'gimel','ד':'dalet','ה':'heh','ו':'vav' };
const CLASS_ORDER    = [
  'alef-tzvia','alef-avigail','bet-dganit','bet-sara',
  'gimel-orly','gimel-magi','dalet-miri','heh-michal','vav-eti','vav-varda',
];
const LOCK_TTL_MS = 30_000; // 30 seconds
const GRADE_FROM_ID_PREFIX = { alef: 'א', bet: 'ב', gimel: 'ג', dalet: 'ד', heh: 'ה', vav: 'ו' };
const WEEK_HEBREW_DATES = [
  'כ"ה ניסן – א\' אייר',
  'ב\' אייר – ח\' אייר',
  'ט\' אייר – ט"ו אייר',
  'ט"ז אייר – כ"ב אייר',
  'כ"ג אייר – כ"ט אייר',
  'א\' סיוון – ז\' סיוון',
  'ח\' סיוון – י"ד סיוון',
  'ט"ו סיוון – כ"א סיוון',
  'כ"ב סיוון – כ"ח סיוון',
  'כ"ט סיוון – ה\' תמוז',
];

// ─── State ─────────────────────────────────────────────────────────────────────
let currentUser   = null;   // { uid, name, role, classIds, badge }
let currentClass  = null;   // classId string
let unsubs        = [];     // Firestore unsubscribers

// ─── Helpers ───────────────────────────────────────────────────────────────────
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

let toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = type === 'err' ? '#C0392B' : '#1A2744';
  el.classList.remove('hidden'); el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 300); }, 2200);
}

function clearUnsubs() { unsubs.forEach(u => u()); unsubs = []; }

function isAdmin() {
  return currentUser?.role === 'coach' || currentUser?.role === 'manager';
}

function canEdit(classId) {
  if (!currentUser) return false;
  if (isAdmin()) return true;
  return currentUser.classIds.includes(classId);
}

function getGradeFromClassId(classId) {
  return GRADE_FROM_ID_PREFIX[(classId || '').split('-')[0]] || '';
}

// ─── Auth State ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async firebaseUser => {
  if (firebaseUser && !firebaseUser.isAnonymous) {
    // Real logged-in user
    const userDef = PREDEFINED_USERS.find(u => u.email === firebaseUser.email);
    if (!userDef) { await signOut(auth); return; }
    currentUser = { uid: firebaseUser.uid, ...userDef };

    // Write user profile to Firestore so security rules can verify class ownership.
    // Uses merge:true to avoid overwriting any extra fields written by admins.
    try {
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        role:     userDef.role,
        classIds: userDef.classIds,
        name:     userDef.name,
        email:    userDef.email,
      }, { merge: true });
      console.log('[auth] user doc written for', userDef.name, '| classIds:', userDef.classIds);
    } catch (e) {
      // Non-fatal: the app still works; Firestore writes will fail with permission errors
      // if this user has no doc and tries to save class data.
      console.warn('[auth] could not write user doc:', e.code, e.message);
    }

    showApp();
    showHome();
  } else if (!firebaseUser) {
    // No session – classes collection is publicly readable so login lookup works
    currentUser = null;
    showLogin();
  } else {
    // Anonymous session – stay on login screen
    currentUser = null;
    showLogin();
  }
});

// ─── Login UI ──────────────────────────────────────────────────────────────────

function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('main-content').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  // User badge
  const roleLabel = { coach: 'מאמנת', manager: 'מנהל', teacher: 'מורה' }[currentUser.role] || 'מורה';
  const roleClass = isAdmin() ? 'role-coach' : 'role-teacher';
  document.getElementById('user-badge').innerHTML =
    `<span>${esc(currentUser.badge)}</span>
     <span class="${roleClass}">${esc(currentUser.name)}</span>
     <span style="opacity:.6;font-size:.75rem">${roleLabel}</span>`;
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const nameInput = document.getElementById('login-user').value.trim();
  const pin       = document.getElementById('login-pin').value.trim();
  const btn       = document.getElementById('login-btn');
  const errEl     = document.getElementById('login-error');

  if (!nameInput) {
    errEl.textContent = 'נא להזין את השם';
    errEl.style.display = '';
    return;
  }
  if (pin.length < 6) {
    errEl.textContent = 'הקוד (PIN) חייב להכיל 6 ספרות בדיוק';
    errEl.style.display = '';
    return;
  }

  btn.disabled = true; btn.textContent = 'מתחברת...';
  errEl.textContent = ''; errEl.style.display = 'none';

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = '';
    btn.disabled = false; btn.textContent = 'כניסה';
  }

  // Normalize for fuzzy match: strip spaces, dashes, lowercase
  const norm = s => String(s || '').trim().replace(/\s+/g, '').replace(/-/g, '').toLowerCase();
  const normalizedInput = norm(nameInput);

  try {
    // ── Step 1: look up email ──────────────────────────────────────────────────
    let emailToUse = null;

    // 1a. Admins: stored only in PREDEFINED_USERS (not in classes collection)
    const adminDef = PREDEFINED_USERS.find(u =>
      (u.role === 'coach' || u.role === 'manager') &&
      norm(u.name) === normalizedInput
    );
    if (adminDef) {
      emailToUse = adminDef.email;
      console.log('[login] admin match:', adminDef.name, '→', emailToUse);
    }

    // 1b. Teachers: query Firestore classes collection for matching name
    if (!emailToUse) {
      let snap;
      try {
        snap = await getDocs(collection(db, 'classes'));
      } catch (dbErr) {
        console.error('[login] getDocs(classes) failed:', dbErr.code, dbErr.message);
        showErr('שגיאת חיבור לשרת – נסי לרענן את הדף');
        return;
      }

      let matchedDocId   = null;
      let matchedDocEmail = null;
      snap.forEach(d => {
        const data    = d.data();
        const docName = data.name || '';
        if (norm(docName) === normalizedInput) {
          matchedDocId    = d.id;
          matchedDocEmail = data.email || null; // email stored on class doc (if setup wrote it)
          console.log('[login] class match:', d.id, '| name:', docName, '| doc.email:', matchedDocEmail);
        }
      });

      if (!matchedDocId) {
        console.warn('[login] no match for "' + nameInput + '" (norm: "' + normalizedInput + '"). Docs in Firestore:');
        snap.forEach(d => console.warn('  id:', d.id, '| name:', d.data().name, '| norm:', norm(d.data().name || '')));
        showErr('השם לא נמצא במערכת – בדקי את האיות ונסי שוב');
        return;
      }

      // Prefer email from Firestore doc; fall back to PREDEFINED_USERS
      // Always normalize email: trim whitespace + lowercase
      if (matchedDocEmail) {
        emailToUse = matchedDocEmail.trim().toLowerCase();
      } else {
        const predefined = PREDEFINED_USERS.find(u =>
          u.id === matchedDocId || u.classIds.includes(matchedDocId)
        );
        if (predefined) {
          emailToUse = predefined.email.trim().toLowerCase();
          console.log('[login] email from PREDEFINED_USERS:', emailToUse);
        }
      }

      if (!emailToUse) {
        console.error('[login] found class doc "' + matchedDocId + '" but no email anywhere');
        showErr('שגיאה פנימית: חסר מידע משתמש, נא לפנות לאטי');
        return;
      }
    }

    // ── Step 2: sign in with found email + entered PIN ─────────────────────────
    // Normalize admin email too (in case it wasn't normalized in step 1a)
    emailToUse = emailToUse.trim().toLowerCase();
    // PIN must be a string (Firebase rejects numbers)
    const pinStr = String(pin);
    console.log('Sending to Firebase -> Email:', emailToUse, 'PIN:', pinStr);
    // signIn only – never createUser / signUp
    await signInWithEmailAndPassword(auth, emailToUse, pinStr);

  } catch (err) {
    console.error('[login] auth error:', err.code, err.message);
    const MSG = {
      'auth/wrong-password':         'הקוד (PIN) שגוי – נסי שוב',
      'auth/invalid-credential':     'הקוד (PIN) שגוי – נסי שוב',
      'auth/user-not-found':         'המשתמשת לא נמצאה – פני למאמנת',
      'auth/too-many-requests':      'יותר מדי ניסיונות – המתיני כמה דקות ונסי שוב',
      'auth/network-request-failed': 'שגיאת רשת – בדקי חיבור אינטרנט',
      'auth/invalid-email':          'כתובת מייל לא תקינה – פני למאמנת',
    };
    showErr(MSG[err.code] || `שגיאה: ${err.code}`);
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  clearUnsubs();
  await signOut(auth);
});

// ─── Home Page ─────────────────────────────────────────────────────────────────
function showHome() {
  clearUnsubs();
  currentClass = null;

  // Teachers go directly to their single class – no dashboard needed
  if (currentUser?.role === 'teacher' && currentUser.classIds.length === 1) {
    openClass(currentUser.classIds[0]);
    return;
  }

  document.getElementById('home-view').classList.remove('hidden');
  document.getElementById('class-view').classList.add('hidden');
  document.getElementById('breadcrumb').innerHTML = '';

  // Real-time listener: all classes
  const unsub = onSnapshot(collection(db, 'classes'), snap => {
    const map = {};
    snap.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
    renderHome(map);
  }, err => toast('שגיאת חיבור: ' + err.message, 'err'));
  unsubs.push(unsub);
}

function renderHome(classMap) {
  // Admin summary bar (coach / manager only)
  if (isAdmin()) renderAdminSummary(classMap);

  // Clear all tile rows then repopulate
  Object.values(GRADE_TILE_ROW).forEach(r => {
    const el = document.getElementById('tiles-' + r);
    if (el) el.innerHTML = '';
  });
  CLASS_ORDER.forEach(id => {
    const cls = classMap[id];
    if (!cls) return;
    const row = document.getElementById('tiles-' + GRADE_TILE_ROW[cls.grade]);
    if (row) row.appendChild(makeTile(id, cls));
  });
}

function renderAdminSummary(classMap) {
  const el = document.getElementById('admin-summary');
  if (!el) return;

  let totalFilled = 0;
  let classesActive = 0;
  const total = CLASS_ORDER.length;

  CLASS_ORDER.forEach(id => {
    const cls = classMap[id];
    if (!cls) return;
    const filled = cls.weeksFilledCount || 0;
    totalFilled += filled;
    if (filled > 0) classesActive++;
  });

  const pct = total > 0 ? Math.round((totalFilled / (total * 10)) * 100) : 0;

  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-num">${classesActive}/${total}</div>
        <div class="summary-label">כיתות פעילות</div>
      </div>
      <div class="summary-card">
        <div class="summary-num">${totalFilled}/${total * 10}</div>
        <div class="summary-label">שבועות מתוכננים</div>
      </div>
      <div class="summary-card">
        <div class="summary-num">${pct}%</div>
        <div class="summary-label">התקדמות כוללת המתווה</div>
      </div>
    </div>
    <div class="summary-progress-bar">
      <div class="summary-progress-fill" style="width:${pct}%"></div>
    </div>`;
}

function makeTile(id, cls) {
  const color    = GRADE_COLORS[cls.grade] || '#555';
  const filled   = cls.weeksFilledCount || 0;
  const pct      = Math.round((filled / 10) * 100);
  const editable = canEdit(id);

  const tile = document.createElement('div');
  tile.className = 'class-tile' + (editable ? '' : ' tile-readonly');
  tile.onclick   = () => openClass(id);
  tile.innerHTML = `
    <div class="tile-grade-badge" style="background:${color}">${esc(cls.grade)}'</div>
    <div class="tile-name">${esc(cls.name)}</div>
    <div class="tile-progress">${filled}/10 שבועות מתוכננים</div>
    <div class="tile-progress-bar">
      <div class="tile-progress-fill" style="width:${pct}%;background:${color}"></div>
    </div>`;
  return tile;
}

// ─── Class Dashboard ────────────────────────────────────────────────────────────
function openClass(id) {
  renderedWeeks = new Set();
  document.getElementById('journal-container').innerHTML = '';
  clearUnsubs();
  currentClass = id;

  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('class-view').classList.remove('hidden');

  // Admins can navigate back to the full dashboard; teachers have no back button
  if (isAdmin()) {
    document.getElementById('breadcrumb').innerHTML = `
      <span class="bc-home" id="bc-home-btn">🏠 לוח בקרה</span>
      <span class="bc-sep">›</span>
      <span class="bc-current" id="bc-class-name">…</span>`;
    document.getElementById('bc-home-btn').onclick = showHome;
  } else {
    document.getElementById('breadcrumb').innerHTML =
      `<span class="bc-current" id="bc-class-name">…</span>`;
  }

  activateTab('goals');

  // Real-time: class document (name, goals, skills, profileNotes)
  const classUnsub = onSnapshot(doc(db, 'classes', id), snap => {
    if (!snap.exists()) return;
    const cls = { id: snap.id, ...snap.data() };
    document.getElementById('bc-class-name').textContent   = cls.name;
    document.getElementById('goals-title').textContent     = `יעדי המפמ"ר – ${cls.name}`;
    document.getElementById('skills-class-name').textContent  = cls.name;
    document.getElementById('profile-class-name').textContent = cls.name;
    document.getElementById('journal-class-name').textContent = cls.name;
    renderAnnualGoal(cls.annualGoal || '', id);
    renderGoals(cls.goals || []);
    renderSkills(cls.skills || [], id);
    renderProfile(cls, id);
  }, err => toast('שגיאה: ' + err.message, 'err'));
  unsubs.push(classUnsub);

  // Real-time: weeks subcollection
  const weeksUnsub = onSnapshot(collection(db, 'classes', id, 'weeks'), snap => {
    const weeks = {};
    let filledCount = 0;
    snap.forEach(d => {
      const w = { num: parseInt(d.id), ...d.data() };
      weeks[parseInt(d.id)] = w;
      if (w.goal?.trim()) filledCount++;
    });
    // Denormalize filled count onto class doc so home tiles + admin summary stay accurate
    updateDoc(doc(db, 'classes', id), { weeksFilledCount: filledCount }).catch(() => {});
    renderJournal(weeks, id);
  }, err => toast('שגיאה: ' + err.message, 'err'));
  unsubs.push(weeksUnsub);
}

// ─── Tabs ───────────────────────────────────────────────────────────────────────
function activateTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + tabId));
}
document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

// ─── Annual Goal ───────────────────────────────────────────────────────────────
// Event listeners are wired ONCE here — never re-attached on Firestore re-fires.
{
  const editBtn   = document.getElementById('annual-goal-edit-btn');
  const display   = document.getElementById('annual-goal-display');
  const editor    = document.getElementById('annual-goal-editor');
  const input     = document.getElementById('annual-goal-input');
  const textEl    = document.getElementById('annual-goal-text');
  const saveBtn   = document.getElementById('annual-goal-save-btn');
  const cancelBtn = document.getElementById('annual-goal-cancel-btn');

  function openAnnualEditor() {
    const cur = textEl.classList.contains('annual-goal-placeholder') ? '' : textEl.textContent;
    input.value = cur;
    display.classList.add('hidden');
    editBtn.classList.add('hidden');
    editor.classList.remove('hidden');
    input.focus();
  }

  function closeAnnualEditor() {
    editor.classList.add('hidden');
    display.classList.remove('hidden');
    if (currentClass && canEdit(currentClass)) editBtn.classList.remove('hidden');
  }

  editBtn.addEventListener('click', openAnnualEditor);

  textEl.addEventListener('click', () => {
    if (currentClass && canEdit(currentClass)) openAnnualEditor();
  });

  cancelBtn.addEventListener('click', closeAnnualEditor);

  saveBtn.addEventListener('click', async () => {
    if (!currentClass) {
      console.error('[annual-goal] שגיאה: classId חסר – לא ניתן לשמור');
      toast('שגיאה: לא זוהתה כיתה – נסי לרענן את הדף', 'err');
      return;
    }
    const newVal = input.value.trim();
    console.log('[annual-goal] שומר לכיתה:', currentClass, '| ערך:', newVal);
    saveBtn.disabled = true;
    try {
      await setDoc(doc(db, 'classes', currentClass), { annualGoal: newVal }, { merge: true });
      console.log('[annual-goal] נשמר בהצלחה ב-Firestore ✓');
      if (newVal) {
        textEl.textContent = newVal;
        textEl.classList.remove('annual-goal-placeholder');
      } else {
        textEl.textContent = 'טרם הוגדר יעד שנתי. זה הזמן לחלום בגדול! ✨';
        textEl.classList.add('annual-goal-placeholder');
      }
      closeAnnualEditor();
      toast('היעד השנתי נשמר בהצלחה ✓');
    } catch (err) {
      console.error('[annual-goal] שגיאה בשמירה:', err);
      toast('שגיאה בשמירה – ' + err.message, 'err');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// Called on every Firestore snapshot — only updates text & button visibility.
function renderAnnualGoal(value, classId) {
  const editable = canEdit(classId);
  const textEl   = document.getElementById('annual-goal-text');
  const editBtn  = document.getElementById('annual-goal-edit-btn');
  const editor   = document.getElementById('annual-goal-editor');

  // Don't touch the UI while the editor is open
  if (!editor.classList.contains('hidden')) return;

  if (value) {
    textEl.textContent = value;
    textEl.classList.remove('annual-goal-placeholder');
  } else {
    textEl.textContent = 'טרם הוגדר יעד שנתי. זה הזמן לחלום בגדול! ✨';
    textEl.classList.add('annual-goal-placeholder');
  }

  editBtn.classList.toggle('hidden', !editable);
  textEl.style.cursor = editable ? 'pointer' : 'default';
}

// ─── Goals ─────────────────────────────────────────────────────────────────────
function renderGoals(goals) {
  document.getElementById('goals-list').innerHTML =
    goals.map(g => `<li>${esc(g)}</li>`).join('');
}

// ─── Skills ────────────────────────────────────────────────────────────────────
function renderSkills(skills, classId) {
  const editable = canEdit(classId);
  const container = document.getElementById('skills-container');
  container.innerHTML = '';
  skills.forEach((s, i) => container.appendChild(makeSkillRow(s, i, skills, classId, editable)));

  const addBtn = document.getElementById('btn-add-skill');
  addBtn.style.display = editable ? '' : 'none';
  addBtn.onclick = () => {
    skills.push('');
    updateDoc(doc(db, 'classes', classId), { skills })
      .then(() => toast('מיומנות נוספה'));
  };
}

function makeSkillRow(skill, index, skills, classId, editable) {
  const row = document.createElement('div');
  row.className = 'skill-item';
  row.innerHTML = `
    <span class="skill-drag">⠿</span>
    <input type="text" value="${esc(skill)}" placeholder="שם המיומנות..."
           ${editable ? '' : 'readonly'}>
    ${editable ? `<button class="btn-del-skill" title="מחיקה">✕</button>` : ''}`;

  if (editable) {
    let t;
    row.querySelector('input').addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => {
        skills[index] = e.target.value;
        updateDoc(doc(db, 'classes', classId), { skills }).then(() => toast('נשמר ✓'));
      }, 700);
    });
    row.querySelector('.btn-del-skill').addEventListener('click', () => {
      skills.splice(index, 1);
      updateDoc(doc(db, 'classes', classId), { skills }).then(() => toast('מיומנות נמחקה'));
    });
  }
  return row;
}

// ─── Profile ───────────────────────────────────────────────────────────────────
function renderProfile(cls, classId) {
  const editable = canEdit(classId);

  // Literacy plan text
  const planTextEl = document.getElementById('literacy-plan-text');
  const planEditor = document.getElementById('literacy-plan-editor');
  if (planTextEl && !planEditor.classList.contains('hidden') === false) {
    // Only update display text when editor is closed
  }
  if (planTextEl && planEditor.classList.contains('hidden')) {
    if (cls.literacyPlan) {
      planTextEl.textContent = cls.literacyPlan;
      planTextEl.classList.remove('literacy-plan-placeholder');
    } else {
      planTextEl.textContent = 'טרם הוגדר מתווה. לחצי על עריכה להוספת המתווה.';
      planTextEl.classList.add('literacy-plan-placeholder');
    }
  }
  const planEditBtn = document.getElementById('literacy-plan-edit-btn');
  if (planEditBtn) planEditBtn.classList.toggle('hidden', !editable);

  // Profile notes
  const ta = document.getElementById('profile-textarea');
  if (document.activeElement !== ta) ta.value = cls.profileNotes || '';
  ta.readOnly = !editable;
}

let profileTimer;
document.getElementById('profile-textarea').addEventListener('input', e => {
  if (!currentClass || !canEdit(currentClass)) return;
  clearTimeout(profileTimer);
  profileTimer = setTimeout(() => {
    updateDoc(doc(db, 'classes', currentClass), { profileNotes: e.target.value })
      .then(() => toast('הערות נשמרו'));
  }, 800);
});

// ─── Profile Help Modal ────────────────────────────────────────────────────────
{
  const overlay   = document.getElementById('profile-modal-overlay');
  const closeBtn  = document.getElementById('profile-modal-close');
  const helpBtn   = document.getElementById('profile-help-btn');

  helpBtn.addEventListener('click', () => overlay.classList.remove('hidden'));
  closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.add('hidden'); });

  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.modal-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById('modal-panel-' + tab.dataset.modalTab).classList.remove('hidden');
    });
  });
}

// ─── Literacy Plan – wired once ────────────────────────────────────────────────
{
  const editBtn   = document.getElementById('literacy-plan-edit-btn');
  const display   = document.getElementById('literacy-plan-display');
  const editor    = document.getElementById('literacy-plan-editor');
  const input     = document.getElementById('literacy-plan-input');
  const textEl    = document.getElementById('literacy-plan-text');
  const saveBtn   = document.getElementById('literacy-plan-save-btn');
  const cancelBtn = document.getElementById('literacy-plan-cancel-btn');

  function openPlanEditor() {
    const cur = textEl.classList.contains('literacy-plan-placeholder') ? '' : textEl.textContent;
    input.value = cur;
    display.classList.add('hidden');
    editBtn.classList.add('hidden');
    editor.classList.remove('hidden');
    input.focus();
  }

  function closePlanEditor() {
    editor.classList.add('hidden');
    display.classList.remove('hidden');
    if (currentClass && canEdit(currentClass)) editBtn.classList.remove('hidden');
  }

  editBtn.addEventListener('click', openPlanEditor);
  textEl.addEventListener('click', () => {
    if (currentClass && canEdit(currentClass)) openPlanEditor();
  });
  cancelBtn.addEventListener('click', closePlanEditor);

  saveBtn.addEventListener('click', async () => {
    if (!currentClass) {
      console.error('[literacy-plan] שגיאה: classId חסר – לא ניתן לשמור');
      toast('שגיאה: לא זוהתה כיתה – נסי לרענן את הדף', 'err');
      return;
    }
    const newVal = input.value.trim();
    console.log('[literacy-plan] שומר לכיתה:', currentClass, '| ערך:', newVal);
    saveBtn.disabled = true;
    try {
      await setDoc(doc(db, 'classes', currentClass), { literacyPlan: newVal }, { merge: true });
      console.log('[literacy-plan] נשמר בהצלחה ב-Firestore ✓');
      if (newVal) {
        textEl.textContent = newVal;
        textEl.classList.remove('literacy-plan-placeholder');
      } else {
        textEl.textContent = 'טרם הוגדר מתווה. לחצי על עריכה להוספת המתווה.';
        textEl.classList.add('literacy-plan-placeholder');
      }
      closePlanEditor();
      toast('הפרופיל הכיתתי נשמר בהצלחה ✓');
    } catch (err) {
      console.error('[literacy-plan] שגיאה בשמירה:', err);
      toast('שגיאה בשמירה – ' + err.message, 'err');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ─── Journal ───────────────────────────────────────────────────────────────────
let renderedWeeks = new Set(); // track which week cards are already in the DOM

function renderJournal(weeksMap, classId) {
  const color    = GRADE_COLORS[document.getElementById('bc-class-name').textContent?.slice(-1)] || '#2980B9';
  const editable = canEdit(classId);
  const container = document.getElementById('journal-container');

  // Build/update cards for weeks 1-10
  for (let num = 1; num <= 10; num++) {
    const week = weeksMap[num] || { num };
    if (!renderedWeeks.has(num)) {
      container.appendChild(makeWeekCard(week, classId, editable, color));
      renderedWeeks.add(num);
    } else {
      syncWeekCard(week);
    }
  }
}

function makeWeekCard(week, classId, editable, color) {
  const num  = week.num;
  const card = document.createElement('div');
  card.className = 'week-card';
  card.id = `week-card-${num}`;

  const headerBg = color || '#2980B9';
  card.innerHTML = `
    <div class="week-header" style="background:${headerBg}" data-week="${num}">
      <div class="week-title-area">
        <div class="week-num-badge">${num}</div>
        <div>
          <div class="week-title">${esc(week.label || `שבוע ${num}`)}</div>
          ${WEEK_HEBREW_DATES[num-1] ? `<div class="week-dates">${esc(WEEK_HEBREW_DATES[num-1])}</div>` : ''}
          ${week.holiday ? `<div class="week-holiday">${esc(week.holiday)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="week-status-dot ${week.goal?.trim() ? 'filled' : ''}"></div>
        <span class="week-chevron">▼</span>
      </div>
    </div>
    <div class="week-body ${num > 2 ? 'collapsed' : ''}" id="week-body-${num}">
      ${!editable ? `<div class="readonly-banner">👁 מצב צפייה – ניתן לקרוא ולהוסיף משוב בלבד</div>` : ''}
      ${WEEK_HEBREW_DATES[num-1] ? `<div class="week-date-body">📅 ${esc(WEEK_HEBREW_DATES[num-1])}</div>` : ''}
      ${makeField(num, 'goal', '🎯 יעד שבועי', 'input', week.goal||'', 'בחרי את המיומנות/יעד המרכזי לשבוע זה', editable)}
      <div class="ped-area">
        ${editable ? `<button class="ped-request-btn" id="ped-btn-${num}">🦁 קבלת משוב ממצפן שאגת הארי</button>` : ''}
        <div class="ped-feedback-wrap" id="ped-feedback-${num}"></div>
      </div>
      ${makeField(num, 'differentiation', '🤝 אופן עבודה דיפרנציאלית', 'textarea', week.differentiation||'', 'איתי – קבוצת תמיכה... לידי – שאר הכיתה...', editable)}
      ${makeField(num, 'notes', '📝 הערות ותצפיות', 'textarea', week.notes||'', 'מה עבד? מה לשפר? תצפיות מהשיעור...', editable)}
      <div class="feedback-section">
        <h4>💬 משוב מדריכה / עמיתות</h4>
        <div class="feedback-list" id="feedback-list-${num}"></div>
        <div class="feedback-compose">
          <textarea id="fb-text-${num}" placeholder="כתבי התייחסות למתווה השבועי..."></textarea>
          <button class="btn-feedback" data-week="${num}">שלחי</button>
        </div>
      </div>
    </div>`;

  // Collapse toggle
  card.querySelector('.week-header').addEventListener('click', () => {
    const body   = document.getElementById(`week-body-${num}`);
    const header = card.querySelector('.week-header');
    const collapsed = body.classList.toggle('collapsed');
    header.classList.toggle('expanded', !collapsed);
  });
  if (num <= 2) card.querySelector('.week-header').classList.add('expanded');

  // Wire up editable fields
  if (editable) {
    wireWeekFields(card, num, classId);
    card.querySelector(`#ped-btn-${num}`)?.addEventListener('click', () => {
      const goalEl  = card.querySelector(`#wk-goal-${num}`);
      const goalText = goalEl?.value?.trim();
      if (!goalText) { toast('הזיני יעד שבועי תחילה'); return; }
      const panel = document.getElementById(`ped-feedback-${num}`);
      if (panel) panel.dataset.lastGoal = ''; // force re-request even for same text
      requestPedagogicalFeedback(goalText, num, classId);
    });
  }
  // Load pedagogical feedback for existing goals on open
  if (week.goal?.trim() && editable) requestPedagogicalFeedback(week.goal.trim(), num, classId);

  // Feedback send
  card.querySelector('.btn-feedback').addEventListener('click', () => submitFeedback(num, classId));

  // Real-time feedback listener
  const fbUnsub = onSnapshot(
    collection(db, 'classes', classId, 'weeks', String(num), 'feedback'),
    snap => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.ts?.seconds || 0) - (b.ts?.seconds || 0));
      renderFeedback(num, items);
    }
  );
  unsubs.push(fbUnsub);

  return card;
}

function makeField(num, field, label, tag, value, placeholder, editable) {
  const id = `wk-${field}-${num}`;
  const ctrl = tag === 'input'
    ? `<input type="text" id="${id}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${editable?'':'readonly'}>`
    : `<textarea id="${id}" placeholder="${esc(placeholder)}" ${editable?'':'readonly'}>${esc(value)}</textarea>`;
  return `
    <div class="field-group" id="fg-${field}-${num}">
      <label for="${id}">${label} <span id="lock-tag-${field}-${num}"></span></label>
      ${ctrl}
    </div>`;
}

function wireWeekFields(card, num, classId) {
  ['goal', 'differentiation', 'notes'].forEach(field => {
    const el = card.querySelector(`#wk-${field}-${num}`);
    if (!el) return;

    let saveTimer, lockTimer;

    el.addEventListener('focus', () => {
      acquireLock(classId, num, field);
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => releaseLock(classId, num, field), LOCK_TTL_MS);
    });

    el.addEventListener('input', () => {
      // Renew lock
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => releaseLock(classId, num, field), LOCK_TTL_MS);
      // Debounced save
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const weekRef = doc(db, 'classes', classId, 'weeks', String(num));
        const snap = await getDoc(weekRef);
        if (snap.exists()) {
          await updateDoc(weekRef, { [field]: el.value });
        } else {
          await setDoc(weekRef, { [field]: el.value, num });
        }
        updateStatusDot(num, el.value, field);
        toast('נשמר ✓');
      }, 700);
    });

    el.addEventListener('blur', () => {
      clearTimeout(lockTimer);
      releaseLock(classId, num, field);
      if (field === 'goal' && el.value.trim()) {
        requestPedagogicalFeedback(el.value.trim(), num, classId);
      }
    });
  });
}

function syncWeekCard(week) {
  const num = week.num;
  ['goal','differentiation','notes'].forEach(field => {
    const el = document.getElementById(`wk-${field}-${num}`);
    if (el && document.activeElement !== el) el.value = week[field] || '';
  });
  updateStatusDot(num, week.goal, 'goal');
  applyLockUI(num, 'goal',          week.goalLock);
  applyLockUI(num, 'differentiation', week.differentiationLock);
  applyLockUI(num, 'notes',          week.notesLock);
}

function updateStatusDot(weekNum, value, field) {
  if (field !== 'goal') return;
  const dot = document.querySelector(`#week-card-${weekNum} .week-status-dot`);
  if (dot) dot.classList.toggle('filled', !!(value?.trim()));
}

// ─── Field Locking ─────────────────────────────────────────────────────────────
async function acquireLock(classId, weekNum, field) {
  if (!currentUser) return;
  const weekRef  = doc(db, 'classes', classId, 'weeks', String(weekNum));
  const lockKey  = field + 'Lock';
  const lockData = { uid: currentUser.uid, name: currentUser.name, expiresAt: Date.now() + LOCK_TTL_MS };
  try {
    const snap = await getDoc(weekRef);
    if (snap.exists()) await updateDoc(weekRef, { [lockKey]: lockData });
    else               await setDoc(weekRef, { num: weekNum, [lockKey]: lockData });
  } catch { /* permissions – ignore */ }
}

async function releaseLock(classId, weekNum, field) {
  if (!currentUser) return;
  const weekRef = doc(db, 'classes', classId, 'weeks', String(weekNum));
  const lockKey = field + 'Lock';
  try {
    const snap = await getDoc(weekRef);
    if (snap.exists()) {
      const current = snap.data()[lockKey];
      if (current?.uid === currentUser.uid)
        await updateDoc(weekRef, { [lockKey]: null });
    }
  } catch { /* permissions – ignore */ }
}

function applyLockUI(weekNum, field, lockData) {
  const fg      = document.getElementById(`fg-${field}-${weekNum}`);
  const el      = document.getElementById(`wk-${field}-${weekNum}`);
  const tagEl   = document.getElementById(`lock-tag-${field}-${weekNum}`);
  if (!fg || !el || !tagEl) return;

  const locked = lockData && lockData.uid !== currentUser?.uid
               && lockData.expiresAt > Date.now();
  const mine   = lockData && lockData.uid === currentUser?.uid;

  fg.classList.toggle('locked-by-other', !!locked);
  fg.classList.toggle('editing-self',    !!mine);
  el.readOnly = locked;

  tagEl.innerHTML = locked
    ? `<span class="lock-tag">🔒 ${esc(lockData.name)} עורכת כעת...</span>`
    : '';
}

// ─── Feedback ──────────────────────────────────────────────────────────────────
function renderFeedback(weekNum, items) {
  const list = document.getElementById(`feedback-list-${weekNum}`);
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<p style="color:#9AA5BD;font-size:.86rem">אין עדיין התייחסויות לשבוע זה</p>';
    return;
  }
  list.innerHTML = items.map(f => {
    const canDel = currentUser?.role === 'coach' || currentUser?.uid === f.uid;
    const tsStr  = f.ts?.toDate ? f.ts.toDate().toLocaleString('he-IL') : '';
    return `
      <div class="feedback-item">
        <span class="feedback-author">${esc(f.author)}</span>
        <span class="feedback-ts">${esc(tsStr)}</span>
        <p class="feedback-text">${esc(f.text)}</p>
        ${canDel ? `<button class="feedback-del" onclick="deleteFeedback('${esc(f.id)}',${weekNum})">✕</button>` : ''}
      </div>`;
  }).join('');
}

async function submitFeedback(weekNum, classId) {
  const ta   = document.getElementById(`fb-text-${weekNum}`);
  const text = ta.value.trim();
  if (!text) { toast('נא לכתוב התייחסות לפני שליחה', 'err'); return; }

  await addDoc(collection(db, 'classes', classId, 'weeks', String(weekNum), 'feedback'), {
    author: currentUser.name,
    uid:    currentUser.uid,
    text,
    ts: serverTimestamp(),
  });
  ta.value = '';
  toast('התייחסות נשלחה');
}

window.deleteFeedback = async (feedbackId, weekNum) => {
  if (!currentClass) return;
  await deleteDoc(doc(db, 'classes', currentClass, 'weeks', String(weekNum), 'feedback', feedbackId));
  toast('הושמטה');
};

// ─── Pedagogical AI Feedback ──────────────────────────────────────────────────
async function requestPedagogicalFeedback(goalText, weekNum, classId) {
  const panel = document.getElementById(`ped-feedback-${weekNum}`);
  if (!panel) return;
  // Skip if same goal already displayed
  if (panel.dataset.lastGoal === goalText) return;
  panel.dataset.lastGoal = goalText;

  const grade = getGradeFromClassId(classId);

  panel.innerHTML = `
    <div class="ped-feedback-loading">
      <span class="ped-spinner">⏳</span> מנתחת את היעד...
    </div>`;

  try {
    const resp = await fetch('/api/pedagogical-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: goalText, grade }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      panel.innerHTML = `<div class="ped-feedback-error">⚠️ ${esc(data.error || 'שגיאה בקבלת משוב')}</div>`;
      return;
    }
    if (!data.feedback) { panel.innerHTML = ''; return; }
    renderPedagogicalFeedback(panel, data.feedback);
  } catch {
    panel.innerHTML = `<div class="ped-feedback-error">⚠️ פיצ'ר המשוב זמין רק בהפעלה מקומית (node server.js)</div>`;
  }
}

function parsePedagogicalFeedback(text) {
  const clean = text.replace(/\*\*/g, '').replace(/\*/g, '').trim();
  const re    = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heads = ['מה מצוין', 'נקודה לדיוק', 'הצעה לניסוח חלופי'];
  function extract(heading) {
    const others = heads.filter(h => h !== heading).map(re).join('|');
    const m = clean.match(new RegExp(`${re(heading)}[:\\s]+([\\s\\S]*?)(?=${others}|$)`));
    return m ? m[1].trim() : '';
  }
  return {
    positive:    extract('מה מצוין'),
    improve:     extract('נקודה לדיוק'),
    alternative: extract('הצעה לניסוח חלופי'),
    raw: clean,
  };
}

function renderPedagogicalFeedback(panel, text) {
  const { positive, improve, alternative, raw } = parsePedagogicalFeedback(text);
  const hasStructure = positive || improve || alternative;

  panel.innerHTML = `
    <div class="ped-feedback-card">
      <div class="ped-feedback-title">🤖 משוב פדגוגי מיידי</div>
      ${positive ? `
        <div class="ped-section ped-positive">
          <div class="ped-section-label">✅ מה מצוין</div>
          <div class="ped-section-text">${esc(positive)}</div>
        </div>` : ''}
      ${improve ? `
        <div class="ped-section ped-improve">
          <div class="ped-section-label">💡 נקודה לדיוק</div>
          <div class="ped-section-text">${esc(improve)}</div>
        </div>` : ''}
      ${alternative ? `
        <div class="ped-section ped-alternative">
          <div class="ped-section-label">✏️ הצעה לניסוח חלופי</div>
          <div class="ped-section-text ped-alt-text">${esc(alternative)}</div>
          <button class="ped-copy-btn" data-text="${esc(alternative)}">📋 העתק</button>
        </div>` : ''}
      ${!hasStructure ? `
        <div class="ped-section">
          <div class="ped-section-text">${esc(raw)}</div>
        </div>` : ''}
    </div>`;

  panel.querySelector('.ped-copy-btn')?.addEventListener('click', function () {
    navigator.clipboard.writeText(this.dataset.text || '').then(() => {
      this.textContent = '✓ הועתק!';
      setTimeout(() => { this.textContent = '📋 העתק'; }, 2000);
    });
  });
}

window.showHome = showHome;
