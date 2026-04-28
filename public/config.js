// ═══════════════════════════════════════════════════════════════
//  הגדרות Firebase – מלאי את הפרטים שלך מ-Firebase Console
//  Project Settings → General → Your apps → Firebase SDK snippet
// ═══════════════════════════════════════════════════════════════

export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBkTNQR-QD07StU2Lxa0CV8A8QHYCC1cq0",
  authDomain:        "shagat-haari.firebaseapp.com",
  projectId:         "shagat-haari",
  storageBucket:     "shagat-haari.firebasestorage.app",
  messagingSenderId: "323497396034",
  appId:             "1:323497396034:web:f8530574699a24a6abaadb",
  measurementId:     "G-HRGBZ6PB0X"
};

// ═══════════════════════════════════════════════════════════════
//  רשימת המשתמשות – שם תצוגה, מייל פנימי, תפקיד, כיתה
//  אל תשני את שדה email – זה המזהה הפנימי של Firebase Auth
//  את הסיסמה (PIN) כל מורה מגדירה בדף ההגדרה הראשוני (setup.html)
// ═══════════════════════════════════════════════════════════════

export const PREDEFINED_USERS = [
  // ── ניהול (גישה מלאה לכל הכיתות) ──────────────────────────
  {
    id:       'coach-michal',
    email:    'michal.coach@shagat.app',
    name:     'מיכל',
    role:     'coach',      // מאמנת – גישה מלאה
    classIds: [],
    badge:    '🦁'
  },
  {
    id:       'manager-avitar',
    email:    'avitar.manager@shagat.app',
    name:     'אביתר',
    role:     'manager',    // מנהל – גישה מלאה
    classIds: [],
    badge:    '🏫'
  },

  // ── שכבת א ─────────────────────────────────────────────────
  { id: 'alef-tzvia',   email: 'tzvia@shagat.app',   name: 'צביה',   role: 'teacher', classIds: ['alef-tzvia'],   badge: '📚' },
  { id: 'alef-avigail', email: 'avigail@shagat.app', name: 'אביגיל', role: 'teacher', classIds: ['alef-avigail'], badge: '📚' },

  // ── שכבת ב ─────────────────────────────────────────────────
  { id: 'bet-dganit',   email: 'dganit@shagat.app',  name: 'דגנית',  role: 'teacher', classIds: ['bet-dganit'],   badge: '📚' },
  { id: 'bet-sara',     email: 'sara@shagat.app',    name: 'שרה',    role: 'teacher', classIds: ['bet-sara'],     badge: '📚' },

  // ── שכבת ג ─────────────────────────────────────────────────
  { id: 'gimel-orly',   email: 'orly@shagat.app',    name: 'אורלי',  role: 'teacher', classIds: ['gimel-orly'],   badge: '📚' },
  { id: 'gimel-magi',   email: 'magi@shagat.app',    name: 'מגי',    role: 'teacher', classIds: ['gimel-magi'],   badge: '📚' },

  // ── שכבת ד ─────────────────────────────────────────────────
  { id: 'dalet-miri',   email: 'miri@shagat.app',    name: 'מירי',   role: 'teacher', classIds: ['dalet-miri'],   badge: '📚' },

  // ── שכבת ה ─────────────────────────────────────────────────
  { id: 'heh-michal',   email: 'michal.t@shagat.app', name: 'מיכל',    role: 'teacher', classIds: ['heh-michal'],  badge: '📚' },

  // ── שכבת ו ─────────────────────────────────────────────────
  { id: 'vav-eti',      email: 'eti@shagat.app',     name: 'אתי',    role: 'teacher', classIds: ['vav-eti'],      badge: '📚' },
  { id: 'vav-varda',    email: 'varda@shagat.app',   name: 'ורדה',   role: 'teacher', classIds: ['vav-varda'],    badge: '📚' },
];
