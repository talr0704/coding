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
  constructor(cx = 240, cy = 240) {
    this.x         = cx;
    this.y         = cy;
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

    // Canvas dimensions (changeable via resize / setup)
    this.W = 480;
    this.H = 480;

    // Shape registry: name → 'builtin' | url-string
    this._shapeReg = Object.fromEntries(Object.keys(_BUILTIN).map(k => [k, 'builtin']));
    // Loaded image cache: name → HTMLImageElement
    this._imgCache = {};

    this._turtles = {};
    this._nextId  = 0;
    this.bgColor  = '#ffffff';

    // Background image state (drawn on _bgC canvas)
    this._bgpicImg = null;
    this._bgpicUrl = null;

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
      width: this.W + 'px', height: this.H + 'px',
      backgroundColor: this.bgColor
    });

    // Three canvas layers with explicit z-index:
    //   _bgC  (z=0) — bgpic background image
    //   _lineC (z=1) — persistent pen drawings
    //   _sprC  (z=2) — turtle sprite (redrawn on every move)
    this._bgC   = this._mkCanvas('tk-bg');
    this._lineC = this._mkCanvas('tk-lines');
    this._sprC  = this._mkCanvas('tk-sprite');

    const absLayer = (c, z) => Object.assign(c.style, {
      position: 'absolute', top: '0', left: '0',
      pointerEvents: 'none', zIndex: String(z)
    });
    absLayer(this._bgC,   0);
    absLayer(this._lineC, 1);
    absLayer(this._sprC,  2);

    this._wrap.appendChild(this._bgC);
    this._wrap.appendChild(this._lineC);
    this._wrap.appendChild(this._sprC);

    this._container.innerHTML = '';
    this._container.appendChild(this._wrap);

    this._bgCtx = this._bgC.getContext('2d');
    this._lCtx  = this._lineC.getContext('2d');
    this._sCtx  = this._sprC.getContext('2d');
  }

  _mkCanvas(id) {
    const c = document.createElement('canvas');
    c.id = id; c.width = this.W; c.height = this.H;
    c.style.display = 'block';
    return c;
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  /**
   * Resize all canvas layers and reposition turtles to the new centre.
   * Mirrors wn.setup(width, height) in Python turtle.
   */
  resize(w, h) {
    w = Math.round(w); h = Math.round(h);
    if (w < 1 || h < 1) return;
    const oldW = this.W, oldH = this.H;
    this.W = w; this.H = h;

    // Resize wrapper div
    this._wrap.style.width  = w + 'px';
    this._wrap.style.height = h + 'px';

    // Resize all three canvases (setting width/height clears their content)
    for (const c of [this._bgC, this._lineC, this._sprC]) {
      c.width  = w;
      c.height = h;
    }

    // Move turtles proportionally to preserve relative positions
    Object.values(this._turtles).forEach(t => {
      t.x = (t.x - oldW / 2) * (w / oldW) + w / 2;
      t.y = (t.y - oldH / 2) * (h / oldH) + h / 2;
    });

    // Redraw background and sprites (line canvas was cleared by resize)
    this._drawBgpic();
    this._redrawSprites();
  }

  // ── Turtle lifecycle ──────────────────────────────────────────────────────

  newTurtle() {
    const id = this._nextId++;
    this._turtles[id] = new _TurtleState(this.W / 2, this.H / 2);
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
    this._moveTo(id, this.W / 2 + tx, this.H / 2 - ty);
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
    // Do NOT set crossOrigin: the project-images panel loads the same URLs without it,
    // so the browser cache already has responses without CORS headers. Setting
    // crossOrigin='anonymous' here would cause a cache key mismatch and trigger onerror.
    // We never call toDataURL/getImageData so a tainted canvas is acceptable.
    img.onload = () => { this._imgCache[name] = img; this._redrawSprites(); };
    img.onerror = () => {
      console.warn('[Turtle] Could not load shape image:', url, '— falling back to classic.');
      this._shapeReg[name] = 'builtin';
      this._redrawSprites();
    };
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

  dot(id, size, color) {
    const t = this._turtles[id];
    const ctx = this._lCtx;
    ctx.beginPath();
    ctx.arc(t.x, t.y, Math.max((size || 1) / 2, 0.5), 0, Math.PI * 2);
    ctx.fillStyle = color || t.penColor;
    ctx.fill();
  }

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

  xcor(id)    { return this._turtles[id].x - this.W / 2; }
  ycor(id)    { return -( this._turtles[id].y - this.H / 2 ); }
  heading(id) { return this._turtles[id].heading; }
  isdown(id)  { return this._turtles[id].penDown; }

  // ── Background ────────────────────────────────────────────────────────────

  bgcolor(color) {
    this.bgColor = color;
    this._wrap.style.backgroundColor = color;
  }

  bgpic(nameOrUrl) {
    // Always clear the bg canvas first
    this._bgCtx.clearRect(0, 0, this.W, this.H);
    this._bgpicImg = null;
    this._bgpicUrl = null;

    if (!nameOrUrl || nameOrUrl === 'nopic') return;

    // Resolve registered name → URL
    let url = nameOrUrl;
    if (this._shapeReg[nameOrUrl] && this._shapeReg[nameOrUrl] !== 'builtin') {
      url = this._shapeReg[nameOrUrl];
    }

    if (!/^https?:\/\//.test(url) && !url.startsWith('data:') && !url.startsWith('blob:')) return;

    this._bgpicUrl = url;
    const img = new Image();
    // No crossOrigin — stays consistent with addshape and the DOM <img> thumbnails
    // (all loaded without CORS headers so the browser cache isn't polluted).
    img.onload = () => {
      this._bgpicImg = img;
      this._drawBgpic();
    };
    img.onerror = () => console.warn('[Turtle] bgpic: could not load image:', url);
    img.src = url;
  }

  _drawBgpic() {
    if (!this._bgpicImg) return;
    const ctx = this._bgCtx;
    ctx.clearRect(0, 0, this.W, this.H);
    const iw = this._bgpicImg.naturalWidth  || this.W;
    const ih = this._bgpicImg.naturalHeight || this.H;
    // Scale to cover: fill the entire canvas, maintain aspect ratio, crop excess
    const scale = Math.max(this.W / iw, this.H / ih);
    const sw = iw * scale, sh = ih * scale;
    ctx.drawImage(this._bgpicImg, (this.W - sw) / 2, (this.H - sh) / 2, sw, sh);
  }

  // ── Clear / Reset ─────────────────────────────────────────────────────────

  clearAll() {
    this._lCtx.clearRect(0, 0, this.W, this.H);
    this._redrawSprites();
  }

  clearTurtle(id) { this.clearAll(); }  // simplified; selective clear not supported

  resetAll() {
    this._lCtx.clearRect(0, 0, this.W, this.H);
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
    t.x = this.W / 2; t.y = this.H / 2;
    t.heading = 0; t.penDown = true;
    t.penColor = '#000000'; t.fillColor = '#000000';
    t.penWidth = 1; t.visible = true; t.fillPath = null;
    t.shape = 'classic';
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
    ctx.clearRect(0, 0, this.W, this.H);
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
