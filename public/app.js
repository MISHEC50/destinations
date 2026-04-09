/* ═══════════════════════════════════════════════════════
   שאגת הארי – Frontend Application
   ═══════════════════════════════════════════════════════ */

// ─── Config ────────────────────────────────────────────────────────────────────

const GRADE_COLORS = { 'א':'#2980B9','ב':'#27AE60','ג':'#16A085','ד':'#E67E22','ה':'#8E44AD','ו':'#C0392B' };
const GRADE_TILE_ROWS = { 'א':'alef','ב':'bet','ג':'gimel','ד':'dalet','ה':'heh','ו':'vav' };

const CLASS_ORDER = [
  'alef-tzvia','alef-avigail',
  'bet-dganit','bet-sara',
  'gimel-orly','gimel-magi',
  'dalet-miri',
  'heh-michal',
  'vav-eti','vav-varda',
];

// ─── State ─────────────────────────────────────────────────────────────────────

let db = null;           // full data from server
let currentClass = null; // id of open class
let ws = null;

// ─── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  setConn('connecting');

  ws.onopen  = () => setConn('connected');
  ws.onclose = () => { setConn('disconnected'); setTimeout(connectWS, 3000); };
  ws.onerror = () => setConn('disconnected');

  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    handleServerMsg(msg);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function handleServerMsg(msg) {
  switch (msg.type) {
    case 'init':
      db = msg.data;
      renderHome();
      break;

    case 'weekUpdated':
      if (db.classes[msg.classId]) {
        const w = db.classes[msg.classId].weeks.find(x => x.num === msg.weekNum);
        if (w) w[msg.field] = msg.value;
      }
      if (currentClass === msg.classId) syncWeekField(msg.weekNum, msg.field, msg.value);
      break;

    case 'feedbackAdded':
      if (db.classes[msg.classId]) {
        const w = db.classes[msg.classId].weeks.find(x => x.num === msg.weekNum);
        if (w) {
          if (!w.feedback.find(f => f.id === msg.entry.id)) w.feedback.push(msg.entry);
        }
      }
      if (currentClass === msg.classId) renderFeedbackList(msg.weekNum);
      break;

    case 'feedbackDeleted':
      if (db.classes[msg.classId]) {
        const w = db.classes[msg.classId].weeks.find(x => x.num === msg.weekNum);
        if (w) w.feedback = w.feedback.filter(f => f.id !== msg.id);
      }
      if (currentClass === msg.classId) renderFeedbackList(msg.weekNum);
      break;

    case 'skillsUpdated':
      if (db.classes[msg.classId]) db.classes[msg.classId].skills = msg.skills;
      if (currentClass === msg.classId) renderSkills();
      break;

    case 'profileUpdated':
      if (db.classes[msg.classId]) db.classes[msg.classId].profileNotes = msg.profileNotes;
      if (currentClass === msg.classId) document.getElementById('profile-textarea').value = msg.profileNotes;
      break;

    case 'profileFileUpdated':
      if (db.classes[msg.classId]) db.classes[msg.classId].profileFileName = msg.profileFileName;
      if (currentClass === msg.classId) updateUploadStatus(msg.profileFileName);
      break;
  }
}

// ─── Home Page ──────────────────────────────────────────────────────────────────

function renderHome() {
  for (const [id, cls] of Object.entries(db.classes)) {
    const rowId = 'tiles-' + GRADE_TILE_ROWS[cls.grade];
    const row = document.getElementById(rowId);
    if (!row) continue;
    row.innerHTML = ''; // clear before re-render
  }
  for (const id of CLASS_ORDER) {
    const cls = db.classes[id];
    if (!cls) continue;
    const rowId = 'tiles-' + GRADE_TILE_ROWS[cls.grade];
    const row = document.getElementById(rowId);
    if (!row) continue;
    row.appendChild(makeTile(id, cls));
  }
}

function makeTile(id, cls) {
  const color = GRADE_COLORS[cls.grade];
  const filled = cls.weeks.filter(w => w.goal.trim()).length;
  const pct = Math.round((filled / 10) * 100);

  const tile = document.createElement('div');
  tile.className = 'class-tile';
  tile.onclick = () => openClass(id);
  tile.innerHTML = `
    <div class="tile-grade-badge" style="background:${color}">${cls.grade}'</div>
    <div class="tile-name">${cls.name}</div>
    <div class="tile-progress">${filled}/10 שבועות מתוכננים</div>
    <div class="tile-progress-bar">
      <div class="tile-progress-fill" style="width:${pct}%;background:${color}"></div>
    </div>`;
  return tile;
}

// ─── Class Dashboard ────────────────────────────────────────────────────────────

function openClass(id) {
  currentClass = id;
  const cls = db.classes[id];

  // breadcrumb
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = `
    <span class="bc-home" onclick="showHome()">🏠 כל הכיתות</span>
    <span class="bc-sep">›</span>
    <span class="bc-current">${cls.name}</span>`;

  // Show class view
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('class-view').classList.remove('hidden');

  // Activate first tab
  activateTab('goals');
  renderGoals(cls);
  renderSkills();
  renderProfile();
  renderJournal();
}

function showHome() {
  currentClass = null;
  document.getElementById('class-view').classList.add('hidden');
  document.getElementById('home-view').classList.remove('hidden');
  document.getElementById('breadcrumb').innerHTML = '';
  renderHome();
}

// ─── Tabs ───────────────────────────────────────────────────────────────────────

function activateTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('hidden', p.id !== 'tab-' + tabId);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// ─── Goals Tab ──────────────────────────────────────────────────────────────────

function renderGoals(cls) {
  document.getElementById('goals-title').textContent = `יעדי המפמ"ר – ${cls.name}`;
  const list = document.getElementById('goals-list');
  list.innerHTML = cls.goals.map(g => `<li>${g}</li>`).join('');
}

// ─── Skills Tab ─────────────────────────────────────────────────────────────────

function renderSkills() {
  const cls = db.classes[currentClass];
  document.getElementById('skills-class-name').textContent = cls.name;
  const container = document.getElementById('skills-container');
  container.innerHTML = '';
  cls.skills.forEach((skill, i) => container.appendChild(makeSkillItem(skill, i)));
}

function makeSkillItem(skill, index) {
  const row = document.createElement('div');
  row.className = 'skill-item';
  row.dataset.index = index;
  row.innerHTML = `
    <span class="skill-drag" title="גרירה">⠿</span>
    <input type="text" value="${escHtml(skill)}" placeholder="שם המיומנות..." data-index="${index}">
    <button class="btn-del-skill" data-index="${index}" title="מחיקה">✕</button>`;

  row.querySelector('input').addEventListener('change', e => {
    const cls = db.classes[currentClass];
    cls.skills[index] = e.target.value;
    send({ type: 'updateSkills', classId: currentClass, skills: cls.skills });
    toast('מיומנות עודכנה');
  });

  row.querySelector('.btn-del-skill').addEventListener('click', () => {
    const cls = db.classes[currentClass];
    cls.skills.splice(index, 1);
    send({ type: 'updateSkills', classId: currentClass, skills: cls.skills });
    renderSkills();
    toast('מיומנות נמחקה');
  });

  return row;
}

document.getElementById('btn-add-skill').addEventListener('click', () => {
  const cls = db.classes[currentClass];
  cls.skills.push('');
  renderSkills();
  const inputs = document.querySelectorAll('#skills-container input');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

// ─── Profile Tab ────────────────────────────────────────────────────────────────

function renderProfile() {
  const cls = db.classes[currentClass];
  document.getElementById('profile-class-name').textContent = cls.name;
  document.getElementById('profile-textarea').value = cls.profileNotes || '';
  updateUploadStatus(cls.profileFileName);
}

function updateUploadStatus(filename) {
  const el = document.getElementById('upload-status');
  if (filename) {
    el.innerHTML = `✅ קובץ קיים: <strong>${escHtml(filename)}</strong>`;
  } else {
    el.textContent = '';
  }
}

// Profile textarea – debounced save
let profileTimer = null;
document.getElementById('profile-textarea').addEventListener('input', e => {
  clearTimeout(profileTimer);
  profileTimer = setTimeout(() => {
    send({ type: 'updateProfile', classId: currentClass, profileNotes: e.target.value });
    toast('הערות נשמרו');
  }, 800);
});

// File upload
const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) uploadFile(e.target.files[0]);
});

uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
});

function uploadFile(file) {
  const status = document.getElementById('upload-status');
  status.textContent = '⏳ מעלה...';
  fetch(`/api/upload/${currentClass}`, {
    method: 'POST',
    headers: { 'X-Filename': encodeURIComponent(file.name), 'Content-Type': file.type },
    body: file,
  })
  .then(r => r.json())
  .then(d => {
    if (db.classes[currentClass]) db.classes[currentClass].profileFileName = d.filename;
    updateUploadStatus(d.filename);
    toast('קובץ הועלה בהצלחה');
  })
  .catch(() => { status.textContent = '❌ שגיאה בהעלאה'; });
}

// ─── Journal Tab ────────────────────────────────────────────────────────────────

function renderJournal() {
  const cls = db.classes[currentClass];
  document.getElementById('journal-class-name').textContent = cls.name;
  const container = document.getElementById('journal-container');
  container.innerHTML = '';
  const color = GRADE_COLORS[cls.grade];
  cls.weeks.forEach(w => container.appendChild(makeWeekCard(w, color)));
}

function makeWeekCard(week, color) {
  const card = document.createElement('div');
  card.className = 'week-card';
  card.id = `week-card-${week.num}`;

  const headerBg = color;
  const hasFilled = week.goal.trim() || week.differentiation.trim();

  card.innerHTML = `
    <div class="week-header" style="background:${headerBg}" data-week="${week.num}">
      <div class="week-title-area">
        <div class="week-num-badge">${week.num}</div>
        <div>
          <div class="week-title">${week.label}</div>
          ${week.holiday ? `<div class="week-holiday">${week.holiday}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="week-status-dot ${hasFilled ? 'filled' : ''}"></div>
        <span class="week-chevron">▼</span>
      </div>
    </div>
    <div class="week-body" id="week-body-${week.num}">
      <div class="field-group">
        <label>🎯 יעד שבועי <span>בחרי את המיומנות/יעד המרכזי לשבוע זה</span></label>
        <input type="text" id="wk-goal-${week.num}" value="${escHtml(week.goal)}"
               placeholder="לדוגמה: ביסוס שטף קריאה – דיוק..." data-field="goal" data-week="${week.num}">
      </div>
      <div class="field-group">
        <label>🤝 אופן עבודה דיפרנציאלית <span>תיאור אופן יישום בקבוצות שונות / "איתי ולידי"</span></label>
        <textarea id="wk-diff-${week.num}" data-field="differentiation" data-week="${week.num}"
                  placeholder="לדוגמה: &#10;איתי – קבוצת תמיכה: עבודה עם לוח צירופים...&#10;לידי – שאר הכיתה: קריאה עצמית + חברותא...">${escHtml(week.differentiation)}</textarea>
      </div>
      <div class="field-group">
        <label>📝 הערות ותצפיות <span>מה עבד? מה לשפר? אנקדוטות מהשיעור</span></label>
        <textarea id="wk-notes-${week.num}" data-field="notes" data-week="${week.num}"
                  placeholder="הערות חופשיות...">${escHtml(week.notes)}</textarea>
      </div>
      <div class="feedback-section">
        <h4>💬 משוב מדריכה / עמיתות</h4>
        <div class="feedback-list" id="feedback-list-${week.num}"></div>
        <div class="feedback-compose">
          <input type="text" id="fb-author-${week.num}" placeholder="שמך..." value="">
          <textarea id="fb-text-${week.num}" placeholder="כתבי התייחסות למתווה השבועי..."></textarea>
          <button class="btn-feedback" data-week="${week.num}">שלחי</button>
        </div>
      </div>
    </div>`;

  // Toggle collapse
  const header = card.querySelector('.week-header');
  header.addEventListener('click', () => {
    const body = document.getElementById(`week-body-${week.num}`);
    const expanded = !body.classList.contains('collapsed');
    body.classList.toggle('collapsed', expanded);
    header.classList.toggle('expanded', !expanded);
  });

  // Debounced save for text fields
  card.querySelectorAll('input[data-field], textarea[data-field]').forEach(el => {
    let timer = null;
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveWeekField(el.dataset.week, el.dataset.field, el.value), 700);
    });
  });

  // Feedback submit
  card.querySelector('.btn-feedback').addEventListener('click', () => submitFeedback(week.num));

  // Expand first two weeks by default
  if (week.num <= 2) {
    card.querySelector('.week-header').classList.add('expanded');
  } else {
    card.querySelector('.week-body').classList.add('collapsed');
  }

  // Render existing feedback
  setTimeout(() => renderFeedbackList(week.num), 0);

  return card;
}

function saveWeekField(weekNum, field, value) {
  const num = parseInt(weekNum);
  const cls = db.classes[currentClass];
  const w = cls.weeks.find(x => x.num === num);
  if (w) w[field] = value;
  send({ type: 'updateWeek', classId: currentClass, weekNum: num, field, value });
  // Update status dot
  updateStatusDot(num);
  toast('נשמר ✓');
}

function updateStatusDot(weekNum) {
  const cls = db.classes[currentClass];
  const w = cls.weeks.find(x => x.num === weekNum);
  if (!w) return;
  const dot = document.querySelector(`#week-card-${weekNum} .week-status-dot`);
  if (dot) dot.classList.toggle('filled', !!(w.goal.trim() || w.differentiation.trim()));
}

function syncWeekField(weekNum, field, value) {
  const el = document.getElementById(`wk-${field === 'goal' ? 'goal' : field === 'differentiation' ? 'diff' : 'notes'}-${weekNum}`);
  if (el && document.activeElement !== el) el.value = value;
}

function renderFeedbackList(weekNum) {
  const cls = db.classes[currentClass];
  const w = cls.weeks.find(x => x.num === weekNum);
  if (!w) return;
  const list = document.getElementById(`feedback-list-${weekNum}`);
  if (!list) return;
  list.innerHTML = w.feedback.length === 0
    ? '<p style="color:#9AA5BD;font-size:.86rem">אין עדיין התייחסויות לשבוע זה</p>'
    : w.feedback.map(f => `
        <div class="feedback-item" id="fb-${f.id}">
          <span class="feedback-author">${escHtml(f.author)}</span>
          <span class="feedback-ts">${escHtml(f.ts)}</span>
          <p class="feedback-text">${escHtml(f.text)}</p>
          <button class="feedback-del" onclick="deleteFeedback(${weekNum},${f.id})" title="מחיקה">✕</button>
        </div>`).join('');
}

function submitFeedback(weekNum) {
  const author = document.getElementById(`fb-author-${weekNum}`).value.trim();
  const text   = document.getElementById(`fb-text-${weekNum}`).value.trim();
  if (!author || !text) { toast('נא למלא שם והתייחסות'); return; }
  send({ type: 'addFeedback', classId: currentClass, weekNum, author, text });
  document.getElementById(`fb-text-${weekNum}`).value = '';
}

function deleteFeedback(weekNum, id) {
  send({ type: 'deleteFeedback', classId: currentClass, weekNum, id });
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function setConn(state) {
  const dot = document.getElementById('conn-indicator');
  dot.className = 'conn-dot ' + state;
  dot.title = { connected: 'מחובר לשרת', disconnected: 'לא מחובר', connecting: 'מתחבר...' }[state];
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 300); }, 2000);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────────

connectWS();
