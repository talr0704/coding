// ── runner.js ────────────────────────────────────────────────────────────────
// Skulpt Python execution with custom TurtleEngine + Hebrew-friendly errors
// Requires: skulpt.min.js, skulkt-stdlib.js, and turtle-engine.js loaded first.
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

export function formatPythonError(err) {
  const errStr = err?.toString() ?? String(err);
  for (const [type, info] of Object.entries(HEBREW_ERRORS)) {
    if (errStr.includes(type)) {
      const lineMatch = errStr.match(/on line (\d+)/i) ?? errStr.match(/line (\d+)/i);
      const lineTag = lineMatch ? ` (שורה ${lineMatch[1]})` : "";
      return { hebrewLabel: info.label + lineTag, hebrewHint: info.hint, technical: errStr };
    }
  }
  const lineMatch = errStr.match(/on line (\d+)/i) ?? errStr.match(/line (\d+)/i);
  const lineTag = lineMatch ? ` (שורה ${lineMatch[1]})` : "";
  return { hebrewLabel: "❌ שגיאה בזמן ריצה" + lineTag, hebrewHint: "אירעה שגיאה בעת הרצת הקוד.", technical: errStr };
}

export function usesTurtle(code) {
  return /\bimport\s+turtle\b/.test(code) || /\bfrom\s+turtle\b/.test(code);
}

// ── TurtleEngine Skulkt bridge ───────────────────────────────────────────────
// Overrides Skulkt's built-in turtle module with our custom engine.

let _engine = null;   // TurtleEngine instance (set per run)

/**
 * Build a Skulkt external library module that delegates all calls to TurtleEngine.
 * Called once per runPython() invocation that uses turtle.
 */
function _buildTurtleModule(engine) {
  _engine = engine;
  const id = engine.defaultId;

  // Helper: wrap a JS function as a Skulkt built-in that accepts Python args
  function _fn(fn) {
    return new Sk.builtin.func(fn);
  }

  // Unwrap a Skulkt value to a JS primitive
  function _js(v) {
    if (v === undefined || v === null) return null;
    if (v instanceof Sk.builtin.str)   return v.v;
    if (v instanceof Sk.builtin.float_) return v.v;
    if (v instanceof Sk.builtin.int_)   return v.v;
    if (typeof v.v !== 'undefined')     return v.v;
    return v;
  }

  const mod = {};

  // Spec: addshape(url) — url is both identifier and source.
  // Resolve a bare name / filename to a loadable URL via the pre-registered shape registry.
  function _resolveShapeUrl(url) {
    if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
    const cleanName = url.replace(/\.[^.]+$/, '');
    const fromClean = engine._shapeReg[cleanName];
    if (fromClean && fromClean !== 'builtin') return fromClean;
    const fromExact = engine._shapeReg[url];
    if (fromExact && fromExact !== 'builtin') return fromExact;
    return url; // unresolvable — addshape onerror will fall back to classic gracefully
  }

  // ── movement ──────────────────────────────────────────────────────────────
  mod.forward  = mod.fd = _fn((_dist)       => { engine.forward(id, _js(_dist)); });
  mod.backward = mod.bk = mod.back = _fn((_dist) => { engine.backward(id, _js(_dist)); });
  mod.right    = mod.rt = _fn((_angle)      => { engine.right(id, _js(_angle)); });
  mod.left     = mod.lt = _fn((_angle)      => { engine.left(id, _js(_angle)); });
  mod.goto     = mod.setpos = mod.setposition = _fn((_x, _y) => {
    engine.goto(id, _js(_x), _y !== undefined ? _js(_y) : 0);
  });
  mod.setx        = _fn((_x)     => { engine.setx(id, _js(_x)); });
  mod.sety        = _fn((_y)     => { engine.sety(id, _js(_y)); });
  mod.setheading  = mod.seth = _fn((_a) => { engine.setheading(id, _js(_a)); });
  mod.home        = _fn(()       => { engine.goto(id, 0, 0); engine.setheading(id, 0); });

  // ── pen ───────────────────────────────────────────────────────────────────
  mod.penup   = mod.pu = mod.up   = _fn(() => { engine.penup(id); });
  mod.pendown = mod.pd = mod.down = _fn(() => { engine.pendown(id); });
  mod.pensize = mod.width = _fn((_w) => { engine.width(id, _js(_w)); });
  mod.pencolor  = _fn((_c)        => { engine.pencolor(id, _js(_c)); });
  mod.fillcolor = _fn((_c)        => { engine.fillcolor(id, _js(_c)); });
  mod.color     = _fn((_p, _f)   => {
    const p = _js(_p), f = _f !== undefined ? _js(_f) : null;
    engine.color(id, p, f);
  });
  mod.begin_fill = _fn(() => { engine.beginFill(id); });
  mod.end_fill   = _fn(() => { engine.endFill(id); });

  // ── shape / visibility ────────────────────────────────────────────────────
  mod.shape      = _fn((_n) => {
    if (_n === undefined) return new Sk.builtin.str(engine._turtles[id].shape);
    engine.shape(id, _js(_n)); // if not registered, engine silently keeps previous shape
  });
  mod.addshape = mod.register_shape = _fn((_url) => {
    const url = _js(_url);
    engine.addshape(url, _resolveShapeUrl(url));
  });
  mod.hideturtle = mod.ht = _fn(() => { engine.hideturtle(id); });
  mod.showturtle = mod.st = _fn(() => { engine.showturtle(id); });
  mod.isvisible  = _fn(() => new Sk.builtin.bool(engine._turtles[id].visible));

  // ── canvas / screen ───────────────────────────────────────────────────────
  mod.bgcolor   = _fn((_c) => { engine.bgcolor(_js(_c)); });
  mod.bgpic     = _fn((_url) => {
    if (_url === undefined) return new Sk.builtin.str('nopic');
    engine.bgpic(_js(_url));
  });
  mod.clear     = mod.clearscreen = _fn(() => { engine.clearAll(); });
  mod.reset     = mod.resetscreen = _fn(() => { engine.resetAll(); });
  mod.Screen    = _fn(() => {
    const screen = new Sk.builtin.object();
    screen.tp$getattr = (name) => {
      const methods = {
        bgcolor:   _fn((_c) => { engine.bgcolor(_js(_c)); }),
        bgpic:     _fn((_url) => {
          if (_url === undefined) return new Sk.builtin.str('nopic');
          engine.bgpic(_js(_url));
        }),
        setup:     _fn(() => {}),
        title:     _fn(() => {}),
        exitonclick: _fn(() => {}),
        tracer:    _fn(() => {}),
        update:    _fn(() => {}),
        mainloop:  _fn(() => {}),
        clear:     _fn(() => { engine.clearAll(); }),
        reset:     _fn(() => { engine.resetAll(); }),
        addshape: _fn((_url) => {
          const url = _js(_url); engine.addshape(url, _resolveShapeUrl(url));
        }),
        register_shape: _fn((_url) => {
          const url = _js(_url); engine.addshape(url, _resolveShapeUrl(url));
        }),
      };
      return methods[name] ?? new Sk.builtin.func(() => Sk.builtin.none.none$);
    };
    return screen;
  });
  mod.tracer    = _fn(() => {});   // no-op (we draw immediately)
  mod.update    = _fn(() => {});
  mod.done      = mod.mainloop = _fn(() => {});
  mod.exitonclick = _fn(() => {});
  mod.title     = _fn(() => {});
  mod.setup     = _fn(() => {});

  // ── stamp / dot / write ───────────────────────────────────────────────────
  mod.stamp  = _fn(() => { engine.stamp(id); });
  mod.dot    = _fn((_size, _color) => {
    engine.dot(id, _size !== undefined ? _js(_size) : 1, _color !== undefined ? _js(_color) : null);
  });
  mod.write  = _fn((_txt, _move, _align, _font) => {
    engine.write(id, _js(_txt), _align ? _js(_align) : 'left');
  });

  // ── state getters ─────────────────────────────────────────────────────────
  mod.xcor     = _fn(() => new Sk.builtin.float_(engine.xcor(id)));
  mod.ycor     = _fn(() => new Sk.builtin.float_(engine.ycor(id)));
  mod.heading  = _fn(() => new Sk.builtin.float_(engine._turtles[id].heading));
  mod.position = mod.pos = _fn(() => {
    return new Sk.builtin.tuple([
      new Sk.builtin.float_(engine.xcor(id)),
      new Sk.builtin.float_(engine.ycor(id))
    ]);
  });
  mod.isdown   = _fn(() => new Sk.builtin.bool(engine._turtles[id].penDown));
  mod.distance = _fn((_x, _y) => {
    const cx = engine.xcor(id), cy = engine.ycor(id);
    const tx = _js(_x), ty = _y !== undefined ? _js(_y) : 0;
    return new Sk.builtin.float_(Math.sqrt((cx-tx)**2 + (cy-ty)**2));
  });
  mod.towards  = _fn((_x, _y) => {
    const cx = engine.xcor(id), cy = engine.ycor(id);
    const tx = _js(_x), ty = _y !== undefined ? _js(_y) : 0;
    const a = Math.atan2(cy - ty, tx - cx) * 180 / Math.PI;
    return new Sk.builtin.float_(((a % 360) + 360) % 360);
  });
  mod.getscreen = _fn(() => Sk.builtin.none.none$);
  mod.speed     = _fn(() => {});   // speed control not needed in synchronous mode
  mod.circle    = _fn((_r, _ext, _steps) => {
    // Approximate a circle/arc via polygon
    const r = _js(_r);
    const extent = _ext !== undefined ? _js(_ext) : 360;
    const steps  = _steps !== undefined ? _js(_steps) : Math.max(8, Math.abs(Math.round(r / 2)));
    const stepAngle = extent / steps;
    const stepLen   = 2 * Math.abs(r) * Math.sin(Math.PI * stepAngle / 360);
    const turnDir   = r >= 0 ? 1 : -1;
    engine.left(id, stepAngle / 2 * turnDir);
    for (let i = 0; i < steps; i++) {
      engine.forward(id, stepLen);
      engine.left(id, stepAngle * turnDir);
    }
    engine.right(id, stepAngle / 2 * turnDir);
  });

  // ── Turtle class (OOP interface) ──────────────────────────────────────────
  mod.Turtle = new Sk.builtin.func(() => {
    const tid = engine.newTurtle();
    const obj = new Sk.builtin.object();

    const _m = (fn) => new Sk.builtin.func(fn);
    const methods = {
      forward:  _m((d)     => engine.forward(tid, _js(d))),
      fd:       _m((d)     => engine.forward(tid, _js(d))),
      backward: _m((d)     => engine.backward(tid, _js(d))),
      bk:       _m((d)     => engine.backward(tid, _js(d))),
      back:     _m((d)     => engine.backward(tid, _js(d))),
      right:    _m((a)     => engine.right(tid, _js(a))),
      rt:       _m((a)     => engine.right(tid, _js(a))),
      left:     _m((a)     => engine.left(tid, _js(a))),
      lt:       _m((a)     => engine.left(tid, _js(a))),
      goto:     _m((x, y)  => engine.goto(tid, _js(x), y !== undefined ? _js(y) : 0)),
      setpos:   _m((x, y)  => engine.goto(tid, _js(x), y !== undefined ? _js(y) : 0)),
      setx:     _m((x)     => engine.setx(tid, _js(x))),
      sety:     _m((y)     => engine.sety(tid, _js(y))),
      setheading: _m((a)   => engine.setheading(tid, _js(a))),
      seth:     _m((a)     => engine.setheading(tid, _js(a))),
      home:     _m(()      => { engine.goto(tid, 0, 0); engine.setheading(tid, 0); }),
      penup:    _m(()      => engine.penup(tid)),
      pu:       _m(()      => engine.penup(tid)),
      up:       _m(()      => engine.penup(tid)),
      pendown:  _m(()      => engine.pendown(tid)),
      pd:       _m(()      => engine.pendown(tid)),
      down:     _m(()      => engine.pendown(tid)),
      pensize:  _m((w)     => engine.width(tid, _js(w))),
      width:    _m((w)     => engine.width(tid, _js(w))),
      pencolor: _m((c)     => engine.pencolor(tid, _js(c))),
      fillcolor:_m((c)     => engine.fillcolor(tid, _js(c))),
      color:    _m((p, f)  => engine.color(tid, _js(p), f !== undefined ? _js(f) : null)),
      begin_fill: _m(()    => engine.beginFill(tid)),
      end_fill:   _m(()    => engine.endFill(tid)),
      shape:    _m((n)     => { if (n !== undefined) engine.shape(tid, _js(n)); }),
      addshape: _m((url)   => { const u = _js(url); engine.addshape(u, _resolveShapeUrl(u)); }),
      hideturtle: _m(()    => engine.hideturtle(tid)),
      ht:       _m(()      => engine.hideturtle(tid)),
      showturtle: _m(()    => engine.showturtle(tid)),
      st:       _m(()      => engine.showturtle(tid)),
      isvisible: _m(()     => new Sk.builtin.bool(engine._turtles[tid].visible)),
      stamp:    _m(()           => engine.stamp(tid)),
      dot:      _m((sz, col)    => engine.dot(tid, sz !== undefined ? _js(sz) : 1, col !== undefined ? _js(col) : null)),
      write:    _m((t, mv, al)  => engine.write(tid, _js(t), al ? _js(al) : 'left')),
      xcor:     _m(()      => new Sk.builtin.float_(engine.xcor(tid))),
      ycor:     _m(()      => new Sk.builtin.float_(engine.ycor(tid))),
      heading:  _m(()      => new Sk.builtin.float_(engine._turtles[tid].heading)),
      pos:      _m(()      => new Sk.builtin.tuple([new Sk.builtin.float_(engine.xcor(tid)), new Sk.builtin.float_(engine.ycor(tid))])),
      position: _m(()      => new Sk.builtin.tuple([new Sk.builtin.float_(engine.xcor(tid)), new Sk.builtin.float_(engine.ycor(tid))])),
      isdown:   _m(()      => new Sk.builtin.bool(engine._turtles[tid].penDown)),
      speed:    _m(()      => {}),
      clear:    _m(()      => engine.clearTurtle(tid)),
      reset:    _m(()      => engine.resetTurtle(tid)),
      circle:   _m((r, ext, steps) => {
        const rv = _js(r);
        const extent = ext !== undefined ? _js(ext) : 360;
        const nsteps = steps !== undefined ? _js(steps) : Math.max(8, Math.abs(Math.round(rv / 2)));
        const sa = extent / nsteps;
        const sl = 2 * Math.abs(rv) * Math.sin(Math.PI * sa / 360);
        const dir = rv >= 0 ? 1 : -1;
        engine.left(tid, sa / 2 * dir);
        for (let i = 0; i < nsteps; i++) { engine.forward(tid, sl); engine.left(tid, sa * dir); }
        engine.right(tid, sa / 2 * dir);
      }),
      distance: _m((x, y)  => {
        const cx = engine.xcor(tid), cy = engine.ycor(tid);
        return new Sk.builtin.float_(Math.sqrt((_js(x)-cx)**2 + ((y !== undefined ? _js(y) : 0)-cy)**2));
      }),
      towards:  _m((x, y)  => {
        const cx = engine.xcor(tid), cy = engine.ycor(tid);
        const a = Math.atan2(cy - (y !== undefined ? _js(y) : 0), _js(x) - cx) * 180 / Math.PI;
        return new Sk.builtin.float_(((a % 360) + 360) % 360);
      }),
      getscreen: _m(()     => Sk.builtin.none.none$),
    };

    obj.tp$getattr = (name) => {
      if (name in methods) return methods[name];
      return Sk.builtin.none.none$;
    };

    return obj;
  });

  return mod;
}

// ── Main runner ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string}   opts.mainCode
 * @param {object}   opts.extraFiles
 * @param {function} opts.onOutput
 * @param {function} opts.onInput
 * @param {string|null} opts.turtleTarget   div id for TurtleEngine
 * @param {object|null} opts.projectImages  { cleanName: url } for shape pre-registration
 */
export async function runPython({ mainCode, extraFiles = {}, onOutput, onInput, turtleTarget = null, projectImages = null }) {

  // The turtle module stub creates TurtleEngine LAZILY when Python's `import turtle`
  // runs — not before. This prevents the conflict where Skulkt's init code deletes
  // our pre-created canvases. The stub is injected via Sk.builtinFiles AND our
  // read() callback (belt-and-suspenders, since we're not sure which path Skulkt uses).
  const turtleStub = turtleTarget ? `var $builtinmodule = function() {
    var c = document.getElementById(${JSON.stringify(turtleTarget)});
    if (!c || !window.TurtleEngine) return {};
    c.innerHTML = '';
    var eng = new window.TurtleEngine(c);
    if (window._tkProjectImages) {
      Object.entries(window._tkProjectImages).forEach(function(e) { eng.addshape(e[0], e[1]); });
    }
    window._tkEngine = eng;
    return window._tkBuildModuleFactory(eng);
  };` : null;

  // Store project images globally so the stub can access them
  window._tkProjectImages = projectImages || {};
  window._tkBuildModuleFactory = _buildTurtleModule;
  window._tkEngine = null;

  if (turtleStub) {
    // Patch Sk.builtinFiles so Skulkt finds our stub when it reads src/lib/turtle.js
    if (Sk.builtinFiles && Sk.builtinFiles.files) {
      Sk.builtinFiles.files['src/lib/turtle.js'] = turtleStub;
    }
  } else {
    delete Sk.TurtleGraphics;
  }

  Sk.configure({
    output: onOutput,
    read: (file) => {
      // Intercept turtle module loading — belt-and-suspenders alongside builtinFiles patch
      if (turtleStub && (file === 'src/lib/turtle.js' || file.endsWith('/turtle.js'))) {
        return turtleStub;
      }
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
  } finally {
    window._tkProjectImages = null;
    window._tkBuildModuleFactory = null;
  }
}
