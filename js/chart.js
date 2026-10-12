'use strict';
/* =========================================================
   Gráficos en canvas: velas japonesas + gráficos de líneas e histogramas
   ========================================================= */

let _TC = null;
function themeColors() {
  if (_TC) return _TC;
  const s = getComputedStyle(document.documentElement), g = n => s.getPropertyValue(n).trim();
  _TC = {
    grid: g('--grid'), text: g('--muted'), strong: g('--text'), faint: g('--faint'),
    up: g('--up'), down: g('--down'), accent: g('--accent'), warn: g('--warn'),
    c1: g('--c1'), c2: g('--c2'), c3: g('--c3'), c4: g('--c4'), panel: g('--panel'), border: g('--border2')
  };
  return _TC;
}
function resetThemeColors() { _TC = null; }

function withAlpha(color, a) {
  if (color && color[0] === '#' && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}

function prepCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(10, r.width), h = Math.max(10, r.height);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0) || !isFinite(span)) return [min];
  const raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function seg(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function tri(ctx, x, y, s, dir, color) {
  ctx.beginPath();
  if (dir > 0) { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); }
  else { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y - s); ctx.lineTo(x - s, y - s); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function axisTag(ctx, x, y, w, text, bg) {
  ctx.fillStyle = bg; ctx.fillRect(x, y - 9, w, 18);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 5, y);
}

/* ---------- Gráfico de velas ---------- */
class CandleChart {
  constructor(cv, opts = {}) {
    this.cv = cv; this.candles = [];
    this.view = opts.view || 110; this.offset = 0; this.rightPad = opts.rightPad || 6;
    this.ov = {}; this.sub = opts.sub || 'rsi';
    this.markers = []; this.lines = []; this.zone = null; this.hover = null;
    this.ind = {}; this.indLen = -1; this._raf = null;

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      this.view = Math.round(clamp(this.view * f, 20, 400));
      this.render();
    }, { passive: false });
    let drag = null;
    const startDrag = x => { drag = { x, off: this.offset }; };
    const moveDrag = x => {
      if (!drag) return;
      const d = Math.round((x - drag.x) / (this._bw || 6));
      this.offset = clamp(drag.off + d, 0, Math.max(0, this.candles.length - 20));
    };
    cv.addEventListener('mousedown', e => startDrag(e.clientX));
    window.addEventListener('mouseup', () => { drag = null; });
    cv.addEventListener('mousemove', e => {
      const r = cv.getBoundingClientRect();
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      moveDrag(e.clientX); this.render();
    });
    cv.addEventListener('mouseleave', () => { this.hover = null; this.render(); });
    cv.addEventListener('dblclick', () => { this.offset = 0; this.render(); });
    cv.addEventListener('touchstart', e => { if (e.touches.length === 1) startDrag(e.touches[0].clientX); }, { passive: true });
    cv.addEventListener('touchmove', e => { if (e.touches.length === 1) { e.preventDefault(); moveDrag(e.touches[0].clientX); this.render(); } }, { passive: false });
    cv.addEventListener('touchend', () => { drag = null; });
    if (window.ResizeObserver) new ResizeObserver(() => this.render()).observe(cv);
  }
  setData(c) { this.candles = c; this.indLen = -1; this.render(); }
  computeInd() {
    const cs = this.candles;
    if (this.indLen === cs.length) return;
    const C = cs.map(c => c.c);
    this.ind = {
      sma20: Ind.sma(C, 20), sma50: Ind.sma(C, 50), ema100: Ind.ema(C, 100),
      bb: Ind.bollinger(C, 20, 2), dcH: Ind.dcHigh(cs, 20), dcL: Ind.dcLow(cs, 20),
      rsi: Ind.rsi(C, 14), macd: Ind.macd(C), atr: Ind.atr(cs, 14)
    };
    this.indLen = cs.length;
  }
  render() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.draw(); });
  }
  draw() {
    const { ctx, w, h } = prepCanvas(this.cv);
    const C = themeColors(), cs = this.candles, n = cs.length;
    if (!n || w < 50) return;
    this.computeInd();
    const I = this.ind;
    const axisW = 62, subH = this.sub !== 'none' ? Math.round(h * 0.23) : 0, gap = subH ? 8 : 0;
    const mainH = h - subH - gap, plotW = w - axisW;
    this.offset = clamp(this.offset, 0, Math.max(0, n - 10));
    const end = n - this.offset, start = Math.max(0, end - this.view);
    const slots = this.view + (this.offset === 0 ? this.rightPad : 0);
    const bw = plotW / slots; this._bw = bw;
    const xOf = i => (i - start + 0.5) * bw;

    // Rango vertical
    let lo = Infinity, hi = -Infinity;
    for (let i = start; i < end; i++) { if (cs[i].l < lo) lo = cs[i].l; if (cs[i].h > hi) hi = cs[i].h; }
    if (this.ov.bb) for (let i = start; i < end; i++) if (isNum(I.bb.up[i])) { hi = Math.max(hi, I.bb.up[i]); lo = Math.min(lo, I.bb.lo[i]); }
    const span0 = hi - lo;
    for (const L of this.lines) if (L.price > lo - span0 && L.price < hi + span0) { lo = Math.min(lo, L.price); hi = Math.max(hi, L.price); }
    const pad = (hi - lo) * 0.07 || 1; lo -= pad; hi += pad;
    const top = 26, mh = mainH - top - 6;
    const yOf = p => top + (hi - p) / (hi - lo) * mh;
    const pOf = y => hi - (y - top) / mh * (hi - lo);

    ctx.font = '11px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.lineWidth = 1; ctx.textBaseline = 'middle';

    // Rejilla
    for (const t of niceTicks(lo, hi, 6)) {
      const y = Math.round(yOf(t)) + 0.5; if (y < top - 4 || y > mainH) continue;
      ctx.strokeStyle = C.grid; seg(ctx, 0, y, plotW, y);
      ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(t.toFixed(2), plotW + 6, y);
    }
    const vstep = [5, 10, 20, 25, 50, 100].find(s => this.view / s <= 8) || 100;
    for (let i = Math.ceil(start / vstep) * vstep; i < end; i += vstep) {
      const x = Math.round(xOf(i)) + 0.5; ctx.strokeStyle = C.grid; seg(ctx, x, 0, x, h);
    }

    // Zona (modo predicción)
    if (this.zone) {
      const x0 = xOf(this.zone.from) - bw / 2, x1 = xOf(this.zone.to) + bw / 2;
      ctx.fillStyle = withAlpha(C.accent, 0.08); ctx.fillRect(x0, 0, x1 - x0, mainH);
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = withAlpha(C.accent, 0.6);
      seg(ctx, x0, 0, x0, mainH); seg(ctx, x1, 0, x1, mainH); ctx.restore();
    }

    const poly = (arr, color, width = 1.4, dash, yfn = yOf) => {
      ctx.beginPath(); let on = false;
      for (let i = start; i < end; i++) {
        const v = arr[i]; if (!isNum(v)) { on = false; continue; }
        const x = xOf(i), y = yfn(v);
        if (!on) { ctx.moveTo(x, y); on = true; } else ctx.lineTo(x, y);
      }
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.restore();
    };

    // Indicadores sobre el precio
    if (this.ov.bb) {
      ctx.beginPath(); let first = true;
      for (let i = start; i < end; i++) if (isNum(I.bb.up[i])) { const x = xOf(i), y = yOf(I.bb.up[i]); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
      for (let i = end - 1; i >= start; i--) if (isNum(I.bb.lo[i])) ctx.lineTo(xOf(i), yOf(I.bb.lo[i]));
      ctx.closePath(); ctx.fillStyle = withAlpha(C.c4, 0.07); ctx.fill();
      poly(I.bb.up, C.c4, 1); poly(I.bb.lo, C.c4, 1); poly(I.bb.mid, C.c4, 1, [4, 4]);
    }
    if (this.ov.dc) { poly(I.dcH, C.c4, 1.2, [2, 3]); poly(I.dcL, C.c4, 1.2, [2, 3]); }
    if (this.ov.ema100) poly(I.ema100, C.c3, 1.6);
    if (this.ov.sma50) poly(I.sma50, C.c2, 1.6);
    if (this.ov.sma20) poly(I.sma20, C.c1, 1.6);

    // Velas
    const bodyW = Math.max(1, Math.min(16, bw * 0.68));
    for (let i = start; i < end; i++) {
      const c = cs[i], x = Math.round(xOf(i)) + 0.5, col = c.c >= c.o ? C.up : C.down;
      ctx.strokeStyle = col; ctx.fillStyle = col;
      seg(ctx, x, yOf(c.h), x, yOf(c.l));
      const y1 = yOf(Math.max(c.o, c.c)), y2 = yOf(Math.min(c.o, c.c));
      ctx.fillRect(x - bodyW / 2, y1, bodyW, Math.max(1, y2 - y1));
    }

    // Líneas de entrada / stop / objetivo
    for (const L of this.lines) {
      const y = Math.round(yOf(L.price)) + 0.5; if (y < 0 || y > mainH) continue;
      ctx.save(); ctx.globalAlpha = L.alpha ?? 1; ctx.strokeStyle = L.color; ctx.lineWidth = 1.3;
      ctx.setLineDash(L.dash || [6, 4]); seg(ctx, 0, y, plotW, y); ctx.setLineDash([]);
      ctx.fillStyle = L.color; ctx.textAlign = 'left'; ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(L.label, 8, y - 8); ctx.restore();
      ctx.font = '11px system-ui, sans-serif';
      axisTag(ctx, plotW, y, axisW, L.price.toFixed(2), L.color);
    }

    // Marcadores de operaciones
    for (const m of this.markers) {
      if (m.from && m.i >= start && m.from.i < end) {
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = withAlpha(m.win ? C.up : C.down, 0.8); ctx.lineWidth = 1.2;
        seg(ctx, xOf(m.from.i), yOf(m.from.price), xOf(m.i), yOf(m.price)); ctx.restore();
      }
      if (m.i < start || m.i >= end) continue;
      const x = xOf(m.i), c = cs[m.i];
      if (m.type === 'buy') tri(ctx, x, yOf(c.l) + 11, 6, 1, C.up);
      else if (m.type === 'sell') tri(ctx, x, yOf(c.h) - 11, 6, -1, C.down);
      else {
        ctx.beginPath(); ctx.arc(x, yOf(m.price), 4.5, 0, Math.PI * 2);
        ctx.fillStyle = m.win ? C.up : C.down; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = C.panel; ctx.stroke(); ctx.lineWidth = 1;
      }
    }

    // Último precio
    const last = cs[n - 1];
    { const y = Math.round(yOf(last.c)) + 0.5;
      if (y > 0 && y < mainH) {
        const col = last.c >= last.o ? C.up : C.down;
        ctx.save(); ctx.setLineDash([1, 3]); ctx.strokeStyle = col; seg(ctx, 0, y, plotW, y); ctx.restore();
        axisTag(ctx, plotW, y, axisW, last.c.toFixed(2), col);
      } }

    // Panel inferior
    if (subH) this.drawSub(ctx, C, start, end, xOf, bw, mainH + gap, subH, plotW, axisW, poly);

    // Cruz del ratón e información
    let hi_ = n - 1;
    if (this.hover && this.hover.x < plotW) {
      const i = start + Math.floor(this.hover.x / bw);
      if (i >= start && i < end) {
        hi_ = i;
        const x = Math.round(xOf(i)) + 0.5;
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = C.faint; seg(ctx, x, 0, x, h);
        if (this.hover.y < mainH && this.hover.y > top) { seg(ctx, 0, this.hover.y, plotW, this.hover.y); ctx.restore(); axisTag(ctx, plotW, this.hover.y, axisW, pOf(this.hover.y).toFixed(2), C.faint); }
        else ctx.restore();
      }
    }
    const c = cs[hi_], ch = (c.c / c.o - 1) * 100;
    const parts = [[`#${hi_}`, C.text], [`A ${c.o.toFixed(2)}`, C.strong], [`M ${c.h.toFixed(2)}`, C.strong], [`m ${c.l.toFixed(2)}`, C.strong], [`C ${c.c.toFixed(2)}`, C.strong], [(ch >= 0 ? '+' : '') + ch.toFixed(2) + '%', ch >= 0 ? C.up : C.down]];
    const ovs = [['sma20', 'SMA20', I.sma20, C.c1], ['sma50', 'SMA50', I.sma50, C.c2], ['ema100', 'EMA100', I.ema100, C.c3]];
    for (const [k, lab, arr, col] of ovs) if (this.ov[k] && isNum(arr[hi_])) parts.push([`${lab} ${arr[hi_].toFixed(2)}`, col]);
    if (this.ov.bb && isNum(I.bb.up[hi_])) parts.push([`BB ${I.bb.lo[hi_].toFixed(2)}–${I.bb.up[hi_].toFixed(2)}`, C.c4]);
    let tx = 8; ctx.textAlign = 'left';
    for (const [t, col] of parts) { ctx.fillStyle = col; ctx.fillText(t, tx, 12); tx += ctx.measureText(t).width + 10; }
  }
  drawSub(ctx, C, start, end, xOf, bw, top, H, plotW, axisW, poly) {
    const I = this.ind;
    ctx.strokeStyle = C.border; seg(ctx, 0, top - 4.5, plotW + axisW, top - 4.5);
    const i0 = (this.hover && this.hover.x < plotW) ? clamp(start + Math.floor(this.hover.x / bw), start, end - 1) : end - 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (this.sub === 'rsi') {
      const y = v => top + 4 + (100 - v) / 100 * (H - 8);
      ctx.fillStyle = withAlpha(C.accent, 0.06); ctx.fillRect(0, y(70), plotW, y(30) - y(70));
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.faint; seg(ctx, 0, y(70), plotW, y(70)); seg(ctx, 0, y(30), plotW, y(30)); ctx.restore();
      ctx.fillStyle = C.text; ctx.fillText('70', plotW + 6, y(70)); ctx.fillText('30', plotW + 6, y(30));
      poly(I.rsi, C.c3, 1.5, null, y);
      ctx.fillStyle = C.text; ctx.fillText(`RSI 14  ${fmt.num(I.rsi[i0], 1)}`, 8, top + 8);
    } else if (this.sub === 'macd') {
      let lo = Infinity, hi = -Infinity;
      for (let i = start; i < end; i++) for (const v of [I.macd.line[i], I.macd.signal[i], I.macd.hist[i]]) if (isNum(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!isFinite(lo)) return;
      const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
      const y = v => top + 4 + (m - v) / (2 * m) * (H - 8);
      ctx.strokeStyle = C.faint; seg(ctx, 0, y(0), plotW, y(0));
      const bwid = Math.max(1, bw * 0.6);
      for (let i = start; i < end; i++) {
        const v = I.macd.hist[i]; if (!isNum(v)) continue;
        ctx.fillStyle = withAlpha(v >= 0 ? C.up : C.down, 0.55);
        const y0 = y(0), y1 = y(v); ctx.fillRect(xOf(i) - bwid / 2, Math.min(y0, y1), bwid, Math.max(1, Math.abs(y1 - y0)));
      }
      poly(I.macd.line, C.c2, 1.4, null, y); poly(I.macd.signal, C.c1, 1.4, null, y);
      ctx.fillStyle = C.text; ctx.fillText(`MACD ${fmt.num(I.macd.line[i0], 3)}  señal ${fmt.num(I.macd.signal[i0], 3)}`, 8, top + 8);
    } else if (this.sub === 'vol') {
      let hi = 0; for (let i = start; i < end; i++) hi = Math.max(hi, this.candles[i].v);
      const bwid = Math.max(1, bw * 0.68);
      for (let i = start; i < end; i++) {
        const c = this.candles[i], hh = c.v / hi * (H - 14);
        ctx.fillStyle = withAlpha(c.c >= c.o ? C.up : C.down, 0.45);
        ctx.fillRect(xOf(i) - bwid / 2, top + H - hh, bwid, hh);
      }
      ctx.fillStyle = C.text; ctx.fillText(`Volumen ${this.candles[i0].v}`, 8, top + 8);
    }
  }
}

/* ---------- Gráfico X/Y genérico ---------- */
function plotXY(cv, cfg) {
  const { ctx, w, h } = prepCanvas(cv), C = themeColors();
  const pl = cfg.padL ?? 60, pr = 14, pt = 12, pb = 24, W = w - pl - pr, H = h - pt - pb;
  if (W < 20 || H < 20) return null;
  let { xMin, xMax, yMin, yMax } = cfg;
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  const acc = (x, y) => { if (!isNum(y)) return; if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; };
  for (const s of cfg.series || []) for (let i = 0; i < s.ys.length; i++) acc(s.xs ? s.xs[i] : i, s.ys[i]);
  for (const bd of cfg.bands || []) for (let i = 0; i < bd.lo.length; i++) { acc(bd.xs ? bd.xs[i] : i, bd.lo[i]); acc(bd.xs ? bd.xs[i] : i, bd.hi[i]); }
  for (const hl of cfg.hlines || []) if (hl.include) { c = Math.min(c, hl.y); d = Math.max(d, hl.y); }
  if (xMin === undefined) xMin = a; if (xMax === undefined) xMax = b;
  const p = (d - c) * 0.07 || Math.abs(d) * 0.05 || 1;
  if (yMin === undefined) yMin = c - p; if (yMax === undefined) yMax = d + p;
  if (!isFinite(xMin) || !isFinite(yMin)) return null;
  if (xMax === xMin) xMax = xMin + 1;
  if (yMax === yMin) { yMax += 1; yMin -= 1; }
  const X = x => pl + (x - xMin) / (xMax - xMin) * W, Y = y => pt + (yMax - y) / (yMax - yMin) * H;
  ctx.font = '11px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.lineWidth = 1;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  const yf = cfg.yFmt || (v => +v.toFixed(2)), xf = cfg.xFmt || (v => +v.toFixed(2));
  for (const t of niceTicks(yMin, yMax, cfg.yTicks || 5)) {
    const y = Math.round(Y(t)) + 0.5; ctx.strokeStyle = C.grid; seg(ctx, pl, y, pl + W, y);
    ctx.fillStyle = C.text; ctx.fillText(yf(t), pl - 6, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of niceTicks(xMin, xMax, cfg.xTicks || 6)) {
    const x = Math.round(X(t)) + 0.5; ctx.strokeStyle = C.grid; seg(ctx, x, pt, x, pt + H);
    ctx.fillStyle = C.text; ctx.fillText(xf(t), x, pt + H + 6);
  }
  ctx.save(); ctx.beginPath(); ctx.rect(pl, pt, W, H); ctx.clip();
  for (const v of cfg.vspans || []) { ctx.fillStyle = withAlpha(v.color, v.alpha ?? 0.12); ctx.fillRect(X(v.x0), pt, X(v.x1) - X(v.x0), H); }
  for (const bd of cfg.bands || []) {
    ctx.beginPath();
    for (let i = 0; i < bd.hi.length; i++) { const x = X(bd.xs ? bd.xs[i] : i), y = Y(bd.hi[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = bd.lo.length - 1; i >= 0; i--) ctx.lineTo(X(bd.xs ? bd.xs[i] : i), Y(bd.lo[i]));
    ctx.closePath(); ctx.fillStyle = withAlpha(bd.color, bd.alpha ?? 0.15); ctx.fill();
  }
  for (const s of cfg.series || []) {
    const pts = [];
    for (let i = 0; i < s.ys.length; i++) if (isNum(s.ys[i])) pts.push([X(s.xs ? s.xs[i] : i), Y(s.ys[i])]);
    if (!pts.length) continue;
    if (s.fillZero) {
      const y0 = Y(0);
      for (const [y1, y2, col] of [[pt, y0, C.up], [y0, pt + H, C.down]]) {
        ctx.save(); ctx.beginPath(); ctx.rect(pl, Math.min(y1, y2), W, Math.abs(y2 - y1)); ctx.clip();
        ctx.beginPath(); ctx.moveTo(pts[0][0], y0); for (const q of pts) ctx.lineTo(q[0], q[1]);
        ctx.lineTo(pts[pts.length - 1][0], y0); ctx.closePath(); ctx.fillStyle = withAlpha(col, 0.18); ctx.fill(); ctx.restore();
      }
    }
    ctx.beginPath(); pts.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
    ctx.save(); ctx.strokeStyle = s.color; ctx.globalAlpha = s.alpha ?? 1; ctx.lineWidth = s.width ?? 1.6;
    if (s.dash) ctx.setLineDash(s.dash); ctx.stroke(); ctx.restore();
  }
  ctx.textBaseline = 'bottom';
  for (const hl of cfg.hlines || []) {
    const y = Math.round(Y(hl.y)) + 0.5;
    ctx.save(); ctx.strokeStyle = hl.color; ctx.setLineDash(hl.dash || [5, 4]); ctx.globalAlpha = hl.alpha ?? 0.9; seg(ctx, pl, y, pl + W, y); ctx.restore();
    if (hl.label) { ctx.fillStyle = hl.color; ctx.textAlign = 'right'; ctx.fillText(hl.label, pl + W - 4, y - 2); }
  }
  ctx.textBaseline = 'top';
  for (const vl of cfg.vlines || []) {
    const x = Math.round(X(vl.x)) + 0.5;
    ctx.save(); ctx.strokeStyle = vl.color; ctx.setLineDash(vl.dash || [5, 4]); ctx.globalAlpha = vl.alpha ?? 0.9; seg(ctx, x, pt, x, pt + H); ctx.restore();
    if (vl.label) { ctx.fillStyle = vl.color; ctx.textAlign = 'left'; ctx.fillText(vl.label, x + 4, pt + 2 + (vl.row || 0) * 13); }
  }
  for (const dt of cfg.dots || []) { ctx.beginPath(); ctx.arc(X(dt.x), Y(dt.y), dt.r || 4, 0, Math.PI * 2); ctx.fillStyle = dt.color; ctx.fill(); }
  ctx.restore();
  return { X, Y };
}

/* ---------- Histograma ---------- */
function plotHist(cv, values, cfg = {}) {
  const { ctx, w, h } = prepCanvas(cv), C = themeColors();
  if (!values.length) return;
  let mn = cfg.min ?? values.reduce((a, b) => Math.min(a, b), Infinity);
  let mx = cfg.max ?? values.reduce((a, b) => Math.max(a, b), -Infinity);
  if (mx - mn < 1e-9) { mx += 1; mn -= 1; }
  const bins = cfg.bins || 30, bwv = (mx - mn) / bins, counts = new Array(bins).fill(0);
  for (const v of values) counts[clamp(Math.floor((v - mn) / bwv), 0, bins - 1)]++;
  const pl = 44, pr = 12, pt = 12, pb = 24, W = w - pl - pr, H = h - pt - pb;
  if (W < 20 || H < 20) return;
  const maxC = Math.max(...counts), tot = values.length;
  const X = v => pl + (v - mn) / (mx - mn) * W, Y = c => pt + H - c / maxC * H;
  ctx.font = '11px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of niceTicks(0, maxC / tot * 100, 4)) {
    const y = Math.round(Y(t / 100 * tot)) + 0.5; ctx.strokeStyle = C.grid; seg(ctx, pl, y, pl + W, y);
    ctx.fillStyle = C.text; ctx.fillText(t + '%', pl - 6, y);
  }
  for (let k = 0; k < bins; k++) {
    if (!counts[k]) continue;
    const x0 = X(mn + k * bwv), x1 = X(mn + (k + 1) * bwv);
    ctx.fillStyle = withAlpha(cfg.colorFn ? cfg.colorFn(mn + (k + 0.5) * bwv) : C.accent, 0.75);
    ctx.fillRect(x0 + 0.5, Y(counts[k]), Math.max(1, x1 - x0 - 1), pt + H - Y(counts[k]));
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const xf = cfg.xFmt || (v => +v.toFixed(2));
  for (const t of niceTicks(mn, mx, cfg.xTicks || 6)) { ctx.fillStyle = C.text; ctx.fillText(xf(t), X(t), pt + H + 6); }
  for (const vl of cfg.vlines || []) {
    if (vl.x < mn || vl.x > mx) continue;
    const x = Math.round(X(vl.x)) + 0.5;
    ctx.save(); ctx.strokeStyle = vl.color; ctx.setLineDash([5, 4]); seg(ctx, x, pt, x, pt + H); ctx.restore();
    if (vl.label) { ctx.fillStyle = vl.color; ctx.textAlign = 'left'; ctx.fillText(vl.label, x + 4, pt + (vl.row || 0) * 13); }
  }
}
