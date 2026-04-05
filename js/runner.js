// ── runner.js ────────────────────────────────────────────────────────────────
// Skulpt Python execution with Turtle graphics + Hebrew-friendly error messages
// Requires: skulpt.min.js and skulkt-stdlib.js loaded as global scripts first.
// ─────────────────────────────────────────────────────────────────────────────

// ── Hebrew error catalogue ───────────────────────────────────────────────────
const HEBREW_ERRORS = {
  SyntaxError: {
    label: "🔤 שגיאת תחביר",
    hint: "יש שגיאה באופן כתיבת הקוד. בדוק נקודתיים (:), סוגריים ורווחי הזחה."
  },
  IndentationError: {
    label: "↔️ שגיאת הזחה",
    hint: "רווחי ההזחה בתחילת השורה אינם נכונים. בלוק קוד (לאחר if / for / def) חייב 4 רווחים."
  },
  NameError: {
    label: "🔍 שגיאת שם",
    hint: "השתמשת במשתנה או פונקציה שטרם הוגדרו. בדוק את האיות ואת סדר הגדרת המשתנים."
  },
  TypeError: {
    label: "🔀 שגיאת סוג",
    hint: "ניסית לבצע פעולה על סוג נתונים שגוי — למשל, חיבור מספר ומחרוזת ישירות."
  },
  IndexError: {
    label: "📋 שגיאת אינדקס",
    hint: "ניגשת לאיבר שאינו קיים ברשימה. בדוק שהאינדקס קטן מגודל הרשימה."
  },
  KeyError: {
    label: "🗝️ שגיאת מפתח",
    hint: "המפתח שחיפשת אינו קיים במילון. השתמש ב‍-get() לגישה בטוחה."
  },
  ZeroDivisionError: {
    label: "➗ חלוקה באפס",
    hint: "לא ניתן לחלק מספר באפס. בדוק את הנוסחאות שלך."
  },
  AttributeError: {
    label: "🔧 שגיאת מאפיין",
    hint: "ניסית לגשת למאפיין או לפונקציה שאינם קיימים על האובייקט."
  },
  ImportError: {
    label: "📦 שגיאת ייבוא",
    hint: "לא ניתן לייבא את המודול — בדוק שהשם נכון ושהמודול נתמך ב-Skulpt."
  },
  ModuleNotFoundError: {
    label: "📦 מודול לא נמצא",
    hint: "המודול אינו מותקן. ב-Skulpt נתמכים: math, random, turtle, time, re ועוד."
  },
  ValueError: {
    label: "💬 שגיאת ערך",
    hint: "הערך שהועבר אינו מתאים לפעולה — למשל, המרה של מחרוזת שאינה מספר ל-int."
  },
  RecursionError: {
    label: "🔄 שגיאת רקורסיה",
    hint: "הפונקציה קוראת לעצמה יותר מדי פעמים. בדוק שיש תנאי עצירה."
  },
  StopIteration: {
    label: "🛑 סיום איטרציה",
    hint: "האיטרטור הגיע לסופו. בדוק לולאות ו-generators."
  },
  OverflowError: {
    label: "🔢 שגיאת גלישת מספר",
    hint: "המספר גדול מדי לייצוג."
  },
  MemoryError: {
    label: "💾 שגיאת זיכרון",
    hint: "אזל הזיכרון. הקוד יוצר יותר מדי נתונים."
  }
};

/**
 * Formats a Skulpt error into a Hebrew-friendly object.
 * @param {Error|string} err
 * @returns {{ hebrewLabel: string, hebrewHint: string, technical: string }}
 */
export function formatPythonError(err) {
  const errStr = err?.toString() ?? String(err);

  for (const [type, info] of Object.entries(HEBREW_ERRORS)) {
    if (errStr.includes(type)) {
      const lineMatch = errStr.match(/on line (\d+)/i) ?? errStr.match(/line (\d+)/i);
      const lineTag = lineMatch ? ` (שורה ${lineMatch[1]})` : "";
      return {
        hebrewLabel: info.label + lineTag,
        hebrewHint: info.hint,
        technical: errStr
      };
    }
  }

  // Generic fallback
  const lineMatch = errStr.match(/on line (\d+)/i) ?? errStr.match(/line (\d+)/i);
  const lineTag = lineMatch ? ` (שורה ${lineMatch[1]})` : "";
  return {
    hebrewLabel: "❌ שגיאה בזמן ריצה" + lineTag,
    hebrewHint: "אירעה שגיאה בעת הרצת הקוד.",
    technical: errStr
  };
}

/**
 * Detects whether code uses the turtle module.
 * @param {string} code
 */
export function usesTurtle(code) {
  return /\bimport\s+turtle\b/.test(code) ||
         /\bfrom\s+turtle\b/.test(code);
}

/**
 * Configures Skulpt and runs Python code.
 *
 * @param {object} opts
 * @param {string}   opts.mainCode       - The code of main.py
 * @param {object}   opts.extraFiles     - { filename: code } for additional .py files
 * @param {function} opts.onOutput       - Called with each output string
 * @param {function} opts.onInput        - Called with prompt string, returns Promise<string>
 * @param {string|null} opts.turtleTarget - ID of the div for Turtle canvas, or null
 * @returns {Promise<{ success: boolean, error?: object }>}
 */
export async function runPython({ mainCode, extraFiles = {}, onOutput, onInput, turtleTarget = null }) {
  if (turtleTarget) {
    Sk.TurtleGraphics = { target: turtleTarget, width: 480, height: 480 };
  } else {
    delete Sk.TurtleGraphics;
  }

  Sk.configure({
    output: onOutput,
    read: (file) => {
      if (extraFiles[file] !== undefined) return extraFiles[file];
      if (Sk.builtinFiles?.files?.[file]) return Sk.builtinFiles.files[file];
      throw new Error("File not found: " + file);
    },
    inputfun: onInput,
    inputfunTakesPrompt: true,
    __future__: Sk.python3
  });

  try {
    await Sk.misceval.asyncToPromise(() =>
      Sk.importMainWithBody("<stdin>", false, mainCode, true)
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err };
  }
}
