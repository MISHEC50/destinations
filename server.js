const express = require('express');
const path    = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Pedagogical feedback endpoint ─────────────────────────────────────────
const PEDAGOGICAL_SYSTEM_PROMPT = `אתה משמש כמאמנת אוריינות מומחית. תפקידך לסייע למורות בבית הספר היסודי "השחר" לדייק את "היעד השבועי" שלהן.

בכל פעם שמורה מזינה יעד, עליך לנתח אותו לפי 3 הקריטריונים הבאים:

מדידות וישימות: האם היעד מוגדר כפעולה נצפית (התלמיד יקרא/יכתוב/יזהה) ולא מופשטת (התלמיד יבין/יידע)?

הלימה לשכבת הגיל (לפי חוזר המפמ"ר):
- כיתה א': מיקוד ברכישה, סימני ניקוד והאצת קצב.
- כיתות ב'-ג': ביסוס שטף קריאה (דיוק, קצב, פרוזודיה) ומעבר לכתיב בלתי מנוקד.
- כיתות ד'-ה': שכלול הבנה והפקה של סוגות שונות, ידע לשוני ומורפולוגי.
- כיתה ו': חוסן אורייני, טקסטים מורכבים והכנה לחטיבה.

ריאליות: האם ניתן להשיג את היעד בפרק זמן של שבוע אחד (כ-3 מפגשים של הוראה מפורשת)?

עליך להחזיר תשובה במבנה הבא בלבד:

מה מצוין: (חיזוק חיובי על הניסוח או הבחירה הפדגוגית).

נקודה לדיוק: (הסבר קצר מה חסר כדי שהיעד יהיה ישים ומדיד יותר).

הצעה לניסוח חלופי: (ניסוח מדויק ומדיד שהמורה יכולה להעתיק).

דגשים נוספים:
- כתוב בעברית בלבד.
- שמור על טון מעצים, מקצועי ותומך.
- אם המורה לא ציינה שכבת גיל, בקש ממנה לציין אותה כדי שתוכל לדייק את המשוב.`;

app.post('/api/pedagogical-feedback', async (req, res) => {
  const { goal, grade } = req.body;
  if (!goal?.trim()) return res.json({ feedback: null });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'מפתח ה-API לא מוגדר. הפעילי את השרת עם ANTHROPIC_API_KEY=<מפתח>.',
    });
  }

  const userMessage = grade
    ? `שכבת גיל: כיתה ${grade}\n\nיעד שבועי: ${goal}`
    : `יעד שבועי: ${goal}`;

  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: PEDAGOGICAL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    res.json({ feedback: message.content[0].text });
  } catch (err) {
    console.error('[ai-feedback] שגיאה:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🦁 שאגת הארי פועל בכתובת: http://localhost:${PORT}\n`);
});
