// ── turtle-engine.js ─────────────────────────────────────────────────────────
// Dual-canvas Python-compatible turtle engine for CodeKids.
//
// Architecture:
//   lineCanvas   (bottom) – persistent drawn paths and stamps
//   spriteCanvas (top)    – dynamic turtle sprite, re-rendered on every move
//
// Coordinate system matches Python turtle:
//   (0, 0) = centre of canvas, positive Y = up, heading 0 = East.
// ─────────────────────────────────────────────────────────────────────────────

const _TK_W = 480;
const _TK_H = 480;

function _rad(deg) { return deg * Math.PI / 180; }

// Built-in shape renderers.  Each should draw a shape pointing RIGHT (East).
const _BUILTIN = {
  classic(ctx, fc, pc) {
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-5, 6); ctx.lineTo(-2, 0); ctx.lineTo(-5, -6);
    ctx.closePath();
    ctx.fillStyle = fc; ctx.strokeStyle = pc; ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
  },
  arrow(ctx, fc, pc) {
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(-6, 7); ctx.lineTo(-6, -7);
    ctx.closePath();
    ctx.fillStyle = fc; ctx.strokeStyle = pc; ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
  },
  turtle(ctx, fc, pc) {
    const bdy = (fc && fc !== '#000000') ? fc : '#2d8a4e';
    const bdr = (pc && pc !== '#000000') ? pc : '#1a5c34';
    ctx.fillStyle = bdy; ctx.strokeStyle = bdr; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(11, 0, 3, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  },
  circle(ctx, fc, pc) {
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = fc; ctx.strokeStyle = pc; ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
  },
  square(ctx, fc, pc) {
    ctx.beginPath(); ctx.rect(-7, -7, 14, 14);
    ctx.fillStyle = fc; ctx.strokeStyle = pc; ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
  },
  triangle(ctx, fc, pc) {
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-7, 8); ctx.lineTo(-7, -8);
    ctx.closePath();
    ctx.fillStyle = fc; ctx.strokeStyle = pc; ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
  }
};

class _TurtleState {
  constructor() {
    this.x         = _TK_W / 2;
    this.y         = _TK_H / 2;
    this.heading   = 0;           // degrees; 0 = East
    this.penDown   = true;
    this.penColor  = '#000000';
    this.fillColor = '#000000';
    this.penWidth  = 1;
    this.visible   = true;
    this.shape     = 'classic';
    this.fillPath  = null;        // array of [cx,cy] while between begin/end_fill
  }
}

class TurtleEngine {
  constructor(containerEl) {
    this._container = containerEl;

    // Shape registry: name → 'builtin' | url-string
    this._shapeReg = Object.fromEntries(Object.keys(_BUILTIN).map(k => [k, 'builtin']));
    // Loaded image cache: name → HTMLImageElement
    this._imgCache = {};

    this._turtles = {};
    this._nextId  = 0;
    this.bgColor  = '#ffffff';

    this._buildDOM();
    this.defaultId = this.newTurtle();

    // Expose on container for external access (e.g. clear button, shape selector)
    containerEl._tkEngine = this;
  }

  // ── DOM ───────────────────────────────────────────────────────────────────

  _buildDOM() {
    this._wrap = document.createElement('div');
    Object.assign(this._wrap.style, {
      position: 'relative', display: 'inline-block',
      width: _TK_W + 'px', height: _TK_H + 'px',
      background: this.bgColor
    });

    this._lineC  = this._mkCanvas('tk-lines');
    this._sprC   = this._mkCanvas('tk-sprite');
    Object.assign(this._sprC.style, {
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none'
    });

    this._wrap.appendChild(this._lineC);
    this._wrap.appendChild(this._sprC);

    this._container.innerHTML = '';
    this._container.appendChild(this._wrap);

    this._lCtx = this._lineC.getContext('2d');
    this._sCtx = this._sprC.getContext('2d');
  }

  _mkCanvas(id) {
    const c = document.createElement('canvas');
    c.id = id; c.width = _TK_W; c.height = _TK_H;
    c.style.display = 'block';
    return c;
  }

  // ── Turtle lifecycle ──────────────────────────────────────────────────────

  newTurtle() {
    const id = this._nextId++;
    this._turtles[id] = new _TurtleState();
    this._redrawSprites();
    return id;
  }

  // ── Movement ──────────────────────────────────────────────────────────────

  forward(id, dist) {
    const t = this._turtles[id];
    const r = _rad(t.heading);
    this._moveTo(id, t.x + dist * Math.cos(r), t.y - dist * Math.sin(r));
  }

  backward(id, dist) { this.forward(id, -dist); }

  right(id, angle) {
    const t = this._turtles[id];
    t.heading = ((t.heading - angle) % 360 + 360) % 360;
    this._redrawSprites();
  }

  left(id, angle) { this.right(id, -angle); }

  goto(id, tx, ty) {
    // Python turtle coords → canvas coords
    this._moveTo(id, _TK_W / 2 + tx, _TK_H / 2 - ty);
  }

  setx(id, tx) { this.goto(id, tx, this.ycor(id)); }
  sety(id, ty) { this.goto(id, this.xcor(id), ty); }

  setheading(id, angle) {
    this._turtles[id].heading = ((angle % 360) + 360) % 360;
    this._redrawSprites();
  }

  // ── Pen ───────────────────────────────────────────────────────────────────

  penup(id)   { this._turtles[id].penDown = false; }
  pendown(id) { this._turtles[id].penDown = true; }

  color(id, penColor, fillColor) {
    const t = this._turtles[id];
    t.penColor  = penColor  || t.penColor;
    t.fillColor = fillColor || penColor || t.fillColor;
    this._redrawSprites();
  }

  pencolor(id, c)  { this._turtles[id].penColor  = c; }
  fillcolor(id, c) { this._turtles[id].fillColor = c; this._redrawSprites(); }
  width(id, w)     { this._turtles[id].penWidth  = Math.max(1, Number(w) || 1); }

  // ── Shapes ────────────────────────────────────────────────────────────────

  /**
   * Set the visual shape for a turtle.
   * @param {number} id
   * @param {string} name  registered shape name
   */
  shape(id, name) {
    if (this._shapeReg[name] !== undefined) {
      this._turtles[id].shape = name;
      this._redrawSprites();
    }
  }

  /**
   * Register a named shape.
   * @param {string} name
   * @param {string} url   HTTPS URL or data URL; omit/empty for built-in alias
   */
  addshape(name, url) {
    if (!url) { this._shapeReg[name] = 'builtin'; return; }
    this._shapeReg[name] = url;
    if (this._imgCache[name]) { this._redrawSprites(); return; } // already loaded
    const img = new Image();
    // No crossOrigin — Firebase Storage doesn't return CORS headers for GitHub Pages.
    // The canvas becomes tainted (no pixel read-back), but drawing still works fine.
    img.onload  = () => { this._imgCache[name] = img; this._redrawSprites(); };
    img.onerror = () => console.warn('[Turtle] Could not load shape image:', url);
    img.src = url;
  }

  /** Convenience: register a project image and auto-derive a clean name. */
  registerProjectImage(filename, url) {
    const name = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    this.addshape(name, url);
    return name;
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  hideturtle(id) { this._turtles[id].visible = false; this._redrawSprites(); }
  showturtle(id) { this._turtles[id].visible = true;  this._redrawSprites(); }

  // ── Fill ─────────────────────────────────────────────────────────────────

  beginFill(id) {
    const t = this._turtles[id];
    t.fillPath = [[t.x, t.y]];
  }

  endFill(id) {
    const t = this._turtles[id];
    if (!t.fillPath || t.fillPath.length < 3) { t.fillPath = null; return; }
    const ctx = this._lCtx;
    ctx.beginPath();
    ctx.moveTo(t.fillPath[0][0], t.fillPath[0][1]);
    t.fillPath.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fillStyle = t.fillColor;
    ctx.fill();
    t.fillPath = null;
  }

  // ── Stamp / Write ─────────────────────────────────────────────────────────

  stamp(id) { this._paintSprite(this._lCtx, this._turtles[id]); }

  write(id, text, align) {
    const t = this._turtles[id];
    const ctx = this._lCtx;
    ctx.save();
    ctx.fillStyle    = t.penColor;
    ctx.font         = '14px sans-serif';
    ctx.textAlign    = (align === 'center' || align === 'right') ? align : 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(text), t.x, t.y);
    ctx.restore();
  }

  // ── State getters ─────────────────────────────────────────────────────────

  xcor(id)    { return this._turtles[id].x - _TK_W / 2; }
  ycor(id)    { return -( this._turtles[id].y - _TK_H / 2 ); }
  heading(id) { return this._turtles[id].heading; }
  isdown(id)  { return this._turtles[id].penDown; }

  // ── Background ────────────────────────────────────────────────────────────

  bgcolor(color) {
    this.bgColor = color;
    this._wrap.style.background = color;
  }

  // ── Clear / Reset ─────────────────────────────────────────────────────────

  clearAll() {
    this._lCtx.clearRect(0, 0, _TK_W, _TK_H);
    this._redrawSprites();
  }

  clearTurtle(id) { this.clearAll(); }  // simplified; selective clear not supported

  resetAll() {
    this._lCtx.clearRect(0, 0, _TK_W, _TK_H);
    Object.values(this._turtles).forEach(t => this._resetState(t));
    this._redrawSprites();
  }

  resetTurtle(id) {
    this._resetState(this._turtles[id]);
    this._redrawSprites();
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  /** Called from the shape-selector dropdown to change the default turtle's shape. */
  setShapeFromUI(name) {
    if (this._turtles[this.defaultId]) {
      this._turtles[this.defaultId].shape = name;
      this._redrawSprites();
    }
  }

  /** Return list of registered shape names (built-in + custom). */
  shapeNames() { return Object.keys(this._shapeReg); }

  // ── Private ───────────────────────────────────────────────────────────────

  _resetState(t) {
    t.x = _TK_W / 2; t.y = _TK_H / 2;
    t.heading = 0; t.penDown = true;
    t.penColor = '#000000'; t.fillColor = '#000000';
    t.penWidth = 1; t.visible = true; t.fillPath = null;
  }

  _moveTo(id, nx, ny) {
    const t = this._turtles[id];
    if (t.penDown) {
      const ctx = this._lCtx;
      ctx.beginPath();
      ctx.strokeStyle = t.penColor;
      ctx.lineWidth   = t.penWidth;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(nx,  ny);
      ctx.stroke();
      if (t.fillPath) t.fillPath.push([nx, ny]);
    }
    t.x = nx; t.y = ny;
    this._redrawSprites();
  }

  _redrawSprites() {
    const ctx = this._sCtx;
    ctx.clearRect(0, 0, _TK_W, _TK_H);
    Object.values(this._turtles).forEach(t => {
      if (t.visible) this._paintSprite(ctx, t);
    });
  }

  _paintSprite(ctx, t) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(-_rad(t.heading));  // negative: canvas Y-down vs turtle Y-up

    const img = this._imgCache[t.shape];
    if (img) {
      // Custom image shape — centred, 40×40 px
      ctx.drawImage(img, -20, -20, 40, 40);
    } else if (this._shapeReg[t.shape] === 'builtin' && _BUILTIN[t.shape]) {
      _BUILTIN[t.shape](ctx, t.fillColor, t.penColor);
    } else {
      // Shape registered but image not yet loaded → show classic while waiting
      _BUILTIN.classic(ctx, t.fillColor, t.penColor);
    }

    ctx.restore();
  }
}

// Global access for the Skulkt bridge in runner.js
window.TurtleEngine = TurtleEngine;
