const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'school.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(createInitialData(), null, 2), 'utf8');
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function broadcast(msg, sender) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c !== sender && c.readyState === 1) c.send(payload);
  });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'init', data: readData() }));

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      const data = readData();

      if (msg.type === 'updateWeek') {
        const { classId, weekNum, field, value } = msg;
        const cls = data.classes[classId];
        if (cls) {
          const w = cls.weeks.find(x => x.num === weekNum);
          if (w) { w[field] = value; writeData(data); }
          broadcast({ type: 'weekUpdated', classId, weekNum, field, value }, ws);
        }
      } else if (msg.type === 'addFeedback') {
        const { classId, weekNum, author, text } = msg;
        const cls = data.classes[classId];
        if (cls) {
          const w = cls.weeks.find(x => x.num === weekNum);
          if (w) {
            const entry = { id: Date.now(), author, text, ts: new Date().toLocaleString('he-IL') };
            w.feedback.push(entry);
            writeData(data);
            broadcast({ type: 'feedbackAdded', classId, weekNum, entry }, ws);
            ws.send(JSON.stringify({ type: 'feedbackAdded', classId, weekNum, entry }));
          }
        }
      } else if (msg.type === 'deleteFeedback') {
        const { classId, weekNum, id } = msg;
        const cls = data.classes[classId];
        if (cls) {
          const w = cls.weeks.find(x => x.num === weekNum);
          if (w) {
            w.feedback = w.feedback.filter(f => f.id !== id);
            writeData(data);
            broadcast({ type: 'feedbackDeleted', classId, weekNum, id }, ws);
            ws.send(JSON.stringify({ type: 'feedbackDeleted', classId, weekNum, id }));
          }
        }
      } else if (msg.type === 'updateSkills') {
        const { classId, skills } = msg;
        if (data.classes[classId]) {
          data.classes[classId].skills = skills;
          writeData(data);
          broadcast({ type: 'skillsUpdated', classId, skills }, ws);
        }
      } else if (msg.type === 'updateProfile') {
        const { classId, profileNotes } = msg;
        if (data.classes[classId]) {
          data.classes[classId].profileNotes = profileNotes;
          writeData(data);
          broadcast({ type: 'profileUpdated', classId, profileNotes }, ws);
        }
      }
    } catch (e) {
      console.error('WS error:', e.message);
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/data', (_req, res) => res.json(readData()));

app.post('/api/upload/:classId', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  const { classId } = req.params;
  const filename = decodeURIComponent(req.headers['x-filename'] || 'profile.pdf');
  const uploadDir = path.join(DATA_DIR, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  const dest = path.join(uploadDir, `${classId}_${filename}`);
  fs.writeFileSync(dest, req.body);
  const data = readData();
  if (data.classes[classId]) {
    data.classes[classId].profileFileName = filename;
    writeData(data);
    broadcast({ type: 'profileFileUpdated', classId, profileFileName: filename }, null);
  }
  res.json({ ok: true, filename });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🦁 שאגת הארי – מערכת ניהול למידה אוריינית`);
  console.log(`   פועל בכתובת: http://localhost:${PORT}\n`);
});

// ─── Initial data ────────────────────────────────────────────────────────────

function makeWeeks() {
  return [
    { num: 1,  startDate: '12/4',  endDate: '16/4',  label: 'שבוע 1 – 12–16 באפריל',   holiday: '',                      goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 2,  startDate: '19/4',  endDate: '23/4',  label: 'שבוע 2 – 19–23 באפריל',   holiday: '⭐ יום הזיכרון 21/4, יום העצמאות 22/4', goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 3,  startDate: '26/4',  endDate: '30/4',  label: 'שבוע 3 – 26–30 באפריל',   holiday: '',                      goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 4,  startDate: '3/5',   endDate: '7/5',   label: 'שבוע 4 – 3–7 במאי',        holiday: '',                      goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 5,  startDate: '10/5',  endDate: '14/5',  label: 'שבוע 5 – 10–14 במאי',      holiday: '',                      goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 6,  startDate: '17/5',  endDate: '21/5',  label: 'שבוע 6 – 17–21 במאי',      holiday: '⭐ ערב שבועות 21/5',    goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 7,  startDate: '25/5',  endDate: '29/5',  label: 'שבוע 7 – 25–29 במאי',      holiday: '',                      goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 8,  startDate: '1/6',   endDate: '5/6',   label: 'שבוע 8 – 1–5 ביוני',       holiday: '',                      goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 9,  startDate: '8/6',   endDate: '12/6',  label: 'שבוע 9 – 8–12 ביוני',      holiday: '',                      goal: '', differentiation: '', notes: '', feedback: [] },
    { num: 10, startDate: '15/6',  endDate: '26/6',  label: 'שבוע 10 – 15–26 ביוני',    holiday: '🏁 סוף שנה',            goal: '', differentiation: '', notes: '', feedback: [] },
  ];
}

function defaultSkills(grade) {
  const map = {
    'א': ['פענוח פונולוגי','ידע בסימני ניקוד','קריאה בקול','הבנת הנקרא','כתיבה ספונטנית','אוצר מילים בסיסי'],
    'ב': ['שטף קריאה – דיוק','שטף קריאה – קצב','פרוזודיה','הבנת הנקרא','אוצר מילים','ידע מורפולוגי'],
    'ג': ['שטף קריאה מנוקד','קריאת כתיב לא מנוקד','אסטרטגיות הבנה','ידע מורפולוגי','אוצר מילים','כתיבה יצירתית'],
    'ד': ['הבנת טקסט מידעי','הבנת טקסט ספרותי','ניטור הבנה','אוצר מילים אקדמי','ידע תחבירי','כתיבה רפלקטיבית'],
    'ה': ['הבנת טקסטים מורכבים','ניבוי ושאילת שאלות','ידע לשוני','כתיבה מידעית','כתיבה טיעונית','אוצר מילים מעמיק'],
    'ו': ['פרשנות טקסט','אינטגרציה ממקורות','חשיבה ביקורתית','כתיבה מנומקת','אוריינות דיגיטלית','אוריינות הצגתית'],
  };
  return map[grade] || [];
}

function gradeGoals(grade) {
  const map = {
    'א': [
      'השלמת תהליך רכישת הקריאה והכתיבה בקרב כלל התלמידים',
      'אופטימיזציה של קצב ההוראה לצורך האצת רכישת סימני הניקוד',
      'הוראה מפורשת ושיטתית של הצופן האלפביתי',
      'הוראה בקבוצות קטנות – מודל "איתי ולידי"',
      'עידוד כתיבה ספונטנית ולגיטימציה לטעויות',
      'קריאה דיאלוגית שיתופית של ספרי ילדים איכותיים',
    ],
    'ב': [
      'ביסוס שטף הקריאה: דיוק, קצב ופרוזודיה',
      'מעבר מפענוח מאומץ לקריאה שוטפת, רהוטה והבעתית',
      'הרחבת אוצר מילים והידע המורפולוגי',
      'מרתוני קריאה לשיפור הדיוק והאוטומטיזציה',
      'תרגול קריאה בזיקה להבנת הנקרא',
    ],
    'ג': [
      'ביסוס שטף הקריאה: דיוק, קצב ופרוזודיה',
      'מיקוד במעבר לקריאת הכתיב הבלתי מנוקד',
      'הרחבת אוצר מילים והידע המורפולוגי',
      'הקנאת אסטרטגיות לקריאה ללא ניקוד (הסתמכות על הקשר)',
      'טיפוח מודעות מורפולוגית דרך חקירת מילים',
    ],
    'ד': [
      'שכלול כישורי ההפקה וההבנה של טקסטים מסוגות שונות',
      'ביסוס הידע הלשוני: אוצר מילים, מורפולוגיה ותחביר',
      'למידה מפורשת של ניטור הבנה ובקרה על הקריאה',
      'הרחבת ההתנסויות בכתיבה רפלקטיבית ואישית',
      'קריאה שיתופית של טקסטים מרחיבי דעת ומעוררי מחשבה',
    ],
    'ה': [
      'שכלול כישורי ההפקה וההבנה של טקסטים מסוגות שונות',
      'ביסוס הידע הלשוני: אוצר מילים, מורפולוגיה ותחביר',
      'למידה מפורשת של אסטרטגיות ניבוי ושאילת שאלות',
      'כתיבה שיתופית במסמכים דיגיטליים',
      'שימוש ביחידות "מטקסט לשיעור" ובאינטראקציה דיגיטלית',
    ],
    'ו': [
      'שכלול ההבנה וההפקה של טקסטים מורכבים ממקורות מגוונים',
      'פיתוח מיומנויות המאה ה-21: מכוונות עצמית, אוריינות דיגיטלית, חשיבה ביקורתית',
      'פיתוח הכתיבה ככלי לביטוי עצמי ולהשתתפות חברתית',
      'הכנה לדרישות חטיבת הביניים: פרויקטים, פרזנטציות, פודקאסטים',
      'למידה מפורשת של אסטרטגיות מיזוג מידע ממקורות שונים',
    ],
  };
  return map[grade] || [];
}

function createClass(name, grade) {
  return { name, grade, goals: gradeGoals(grade), profileNotes: '', profileFileName: null, skills: defaultSkills(grade), weeks: makeWeeks() };
}

function createInitialData() {
  return {
    classes: {
      'alef-tzvia':   createClass('א-צביה',   'א'),
      'alef-avigail': createClass('א-אביגיל', 'א'),
      'bet-dganit':   createClass('ב-דגנית',  'ב'),
      'bet-sara':     createClass('ב-שרה',    'ב'),
      'gimel-orly':   createClass('ג-אורלי',  'ג'),
      'gimel-magi':   createClass('ג-מגי',    'ג'),
      'dalet-miri':   createClass('ד-מירי',   'ד'),
      'heh-michal':   createClass('ה-מיכל',   'ה'),
      'vav-eti':      createClass('ו-אתי',    'ו'),
      'vav-varda':    createClass('ו-ורדה',   'ו'),
    }
  };
}
