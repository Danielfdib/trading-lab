'use strict';
/* =========================================================
   Núcleo: utilidades, almacenamiento, generador de mercado,
   indicadores, motor de órdenes, reglas del bot y backtest.
   ========================================================= */

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const sum = a => a.reduce((s, v) => s + v, 0);
const mean = a => a.length ? sum(a) / a.length : NaN;
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmt = {
  money(v, d = 2) {
    if (!isNum(v)) return '—';
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  smoney(v, d = 2) { return !isNum(v) ? '—' : (v > 0 ? '+' : '') + fmt.money(v, d); },
  pct(v, d = 2) { return isNum(v) ? v.toFixed(d) + '%' : '—'; },
  spct(v, d = 2) { return isNum(v) ? (v > 0 ? '+' : '') + v.toFixed(d) + '%' : '—'; },
  num(v, d = 2) { return isNum(v) ? v.toFixed(d) : '—'; },
  r(v) { return isNum(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + 'R' : '—'; },
  pf(v) { return v === Infinity ? '∞' : isNum(v) ? v.toFixed(2) : '—'; },
  qty(v) { return !isNum(v) ? '—' : v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4); }
};

const metric = (k, v, c = '', s = '') =>
  `<div class="metric"><div class="k">${k}</div><div class="v ${c}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

/* ---------- Almacenamiento local (siempre protegido) ---------- */
const Store = {
  get(k, d) { try { const v = localStorage.getItem('tl_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tl_' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
};
const Settings = Object.assign({ capital: 10000, fee: 0, maxLev: 10 }, Store.get('settings', {}));
const saveSettings = () => Store.set('settings', Settings);

function toast(html, type = 'info', ms = 3800) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.innerHTML = html;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, ms);
}

/* ---------- Números aleatorios con semilla ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
class RNG {
  constructor(seed) { this.seed = seed >>> 0; this.r = mulberry32(this.seed); this.spare = null; }
  next() { return this.r(); }
  normal() {
    if (this.spare !== null) { const s = this.spare; this.spare = null; return s; }
    let u, v, s;
    do { u = this.r() * 2 - 1; v = this.r() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    this.spare = v * m; return u * m;
  }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
}
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/* ---------- Escenarios de mercado ---------- */
const SCENARIOS = {
  aleatorio: { name: 'Aleatorio (cambia de régimen)', desc: 'Alterna tendencias alcistas, bajistas y rangos sin avisar, como el mercado real.' },
  alcista: { name: 'Tendencia alcista', desc: 'Sesgo comprador persistente con retrocesos.' },
  bajista: { name: 'Tendencia bajista', desc: 'Sesgo vendedor persistente con rebotes.' },
  lateral: { name: 'Lateral / rango', desc: 'El precio oscila alrededor de un valor medio.' },
  volatil: { name: 'Alta volatilidad', desc: 'Movimientos amplios y erráticos; los stops ajustados saltan con facilidad.' },
  crash: { name: 'Crash repentino', desc: 'Subida tranquila y, en algún momento, una caída fuerte.' },
  noticias: { name: 'Noticias (saltos)', desc: 'Saltos bruscos de precio por noticias inesperadas.' }
};
const randomScenario = () => { const k = Object.keys(SCENARIOS); return k[Math.floor(Math.random() * k.length)]; };
function fillScenarioSelect(sel, extra = []) {
  sel.innerHTML = extra.map(([v, t]) => `<option value="${v}">${t}</option>`).join('') +
    Object.entries(SCENARIOS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
}

/* ---------- Generador de precios ----------
   Movimiento browniano geométrico con regímenes, reversión a la media,
   volatilidad que se agrupa (como GARCH) y saltos. Cada vela se construye
   con 12 "ticks" internos, así sabemos si tocó antes el máximo o el mínimo. */
class Market {
  constructor(scenario = 'aleatorio', seed = randomSeed()) {
    this.scenario = scenario; this.seed = seed; this.rng = new RNG(seed);
    this.price = Math.round(this.rng.range(40, 250));
    this.anchor = this.price; this.baseVol = 0.011; this.vm = 1; this.t = 0;
    this.regime = null; this.regimeLeft = 0; this.candles = [];
    this.crashAt = scenario === 'crash' ? this.rng.int(175, 240) : -1;
  }
  pickRegime() {
    const r = this.rng.next();
    if (r < 0.35) this.regime = { kind: 'alcista', mu: this.rng.range(0.0008, 0.0024), vol: this.rng.range(0.8, 1.2) };
    else if (r < 0.65) this.regime = { kind: 'bajista', mu: -this.rng.range(0.0008, 0.0024), vol: this.rng.range(0.9, 1.4) };
    else this.regime = { kind: 'lateral', mu: 0, vol: this.rng.range(0.6, 1.0), anchor: this.price };
    this.regimeLeft = this.rng.int(30, 120);
  }
  params() {
    let mu = 0, vol = 1, mr = 0, anchor = this.anchor, jumpP = 0.004, jumpS = 0.03;
    switch (this.scenario) {
      case 'alcista': mu = 0.0018; vol = 0.9; break;
      case 'bajista': mu = -0.0018; vol = 1.1; break;
      case 'lateral': mr = 0.07; vol = 0.8; jumpP = 0.002; break;
      case 'volatil': vol = 2.2; jumpP = 0.01; jumpS = 0.05; break;
      case 'noticias': mu = 0.0003; vol = 0.9; jumpP = 0.03; jumpS = 0.045; break;
      case 'crash':
        if (this.t < this.crashAt) { mu = 0.0009; vol = 0.8; }
        else if (this.t < this.crashAt + 14) { mu = -0.018; vol = 2.6; }
        else { mu = 0.0008; vol = 1.8; }
        break;
      default:
        if (this.regimeLeft <= 0) this.pickRegime();
        this.regimeLeft--;
        mu = this.regime.mu; vol = this.regime.vol;
        if (this.regime.kind === 'lateral') { mr = 0.06; anchor = this.regime.anchor; }
    }
    return { mu, sigma: this.baseVol * vol * this.vm, mr, anchor, jumpP, jumpS };
  }
  next() {
    const p = this.params(), N = 12, dt = 1 / N, o = this.price;
    let x = o, h = o, l = o, hiIdx = 0, loIdx = 0, zSum = 0;
    for (let i = 1; i <= N; i++) {
      let drift = p.mu;
      if (p.mr) drift -= p.mr * Math.log(x / p.anchor);
      const z = this.rng.normal(); zSum += z;
      let r = drift * dt + p.sigma * Math.sqrt(dt) * z;
      if (this.rng.next() < p.jumpP * dt) r += (this.rng.next() < 0.5 ? -1 : 1) * p.jumpS * this.rng.range(0.5, 1.5);
      x *= Math.exp(r);
      if (x > h) { h = x; hiIdx = i; }
      if (x < l) { l = x; loIdx = i; }
    }
    const zc = zSum / Math.sqrt(N);
    this.vm = clamp(0.88 * this.vm + 0.12 + 0.18 * (Math.abs(zc) - 0.8), 0.5, 3);
    const move = Math.abs(Math.log(x / o)) / (p.sigma || 1e-9);
    const v = Math.round(1000 * (0.6 + 0.6 * move + 0.4 * this.rng.next()) * (0.7 + 0.3 * this.vm));
    const c = { o, h, l, c: x, v, hiFirst: hiIdx < loIdx, i: this.t };
    this.price = x; this.t++; this.candles.push(c);
    return c;
  }
  generate(n) { for (let i = 0; i < n; i++) this.next(); return this.candles; }
}

/* ---------- Indicadores técnicos (todos causales: sin mirar el futuro) ---------- */
const Ind = {
  sma(a, n) {
    const o = new Array(a.length).fill(NaN); let s = 0;
    for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; }
    return o;
  },
  ema(a, n) {
    const o = new Array(a.length).fill(NaN), k = 2 / (n + 1);
    let e = NaN, cnt = 0, s = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i]; if (!isNum(v)) continue;
      if (cnt < n) { s += v; cnt++; if (cnt === n) { e = s / n; o[i] = e; } }
      else { e = v * k + e * (1 - k); o[i] = e; }
    }
    return o;
  },
  rsi(a, n = 14) {
    const o = new Array(a.length).fill(NaN); let g = 0, l = 0;
    for (let i = 1; i < a.length; i++) {
      const d = a[i] - a[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    }
    return o;
  },
  macd(a, f = 12, s = 26, sg = 9) {
    const ef = Ind.ema(a, f), es = Ind.ema(a, s);
    const line = a.map((_, i) => ef[i] - es[i]);
    const signal = Ind.ema(line, sg);
    return { line, signal, hist: line.map((v, i) => v - signal[i]) };
  },
  bollinger(a, n = 20, k = 2) {
    const mid = Ind.sma(a, n), up = new Array(a.length).fill(NaN), lo = up.slice();
    for (let i = n - 1; i < a.length; i++) {
      let ss = 0; for (let j = i - n + 1; j <= i; j++) ss += (a[j] - mid[i]) ** 2;
      const sd = Math.sqrt(ss / n); up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd;
    }
    return { mid, up, lo };
  },
  atr(c, n = 14) {
    const o = new Array(c.length).fill(NaN); let a = 0;
    for (let i = 0; i < c.length; i++) {
      const tr = i === 0 ? c[i].h - c[i].l : Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
      if (i < n) { a += tr; if (i === n - 1) { a /= n; o[i] = a; } }
      else { a = (a * (n - 1) + tr) / n; o[i] = a; }
    }
    return o;
  },
  // Máximo / mínimo de las N velas ANTERIORES (para detectar rupturas)
  dcHigh(c, n = 20) {
    const o = new Array(c.length).fill(NaN);
    for (let i = n; i < c.length; i++) { let m = -Infinity; for (let j = i - n; j < i; j++) if (c[j].h > m) m = c[j].h; o[i] = m; }
    return o;
  },
  dcLow(c, n = 20) {
    const o = new Array(c.length).fill(NaN);
    for (let i = n; i < c.length; i++) { let m = Infinity; for (let j = i - n; j < i; j++) if (c[j].l < m) m = c[j].l; o[i] = m; }
    return o;
  }
};

/* ---------- Motor de órdenes (una posición a la vez) ---------- */
class Engine {
  constructor(capital, feePct = 0, maxLev = 10) {
    this.cap0 = capital; this.cash = capital; this.fee = feePct / 100; this.maxLev = maxLev;
    this.pos = null; this.trades = []; this.peak = capital; this.maxDD = 0; this.curve = [capital];
    this.onOpen = null; this.onClose = null;
  }
  equity(price) { const p = this.pos; return this.cash + (p ? p.side * (price - p.entry) * p.qty : 0); }
  open(o) {
    if (this.pos) return false;
    const fee = o.price * o.qty * this.fee;
    this.cash -= fee;
    this.pos = Object.assign({}, o, { entry: o.price, entryFee: fee, initSl: o.sl });
    if (this.onOpen) this.onOpen(this.pos);
    return true;
  }
  close(price, bar, reason) {
    const p = this.pos; if (!p) return null;
    const fee = price * p.qty * this.fee, gross = p.side * (price - p.entry) * p.qty;
    this.cash += gross - fee;
    const pnl = gross - fee - p.entryFee;
    const t = {
      side: p.side, entry: p.entry, exit: price, qty: p.qty, pnl,
      R: p.riskUsd > 0 ? pnl / p.riskUsd : null, openBar: p.bar, closeBar: bar, bars: bar - p.bar,
      reason, source: p.source, riskUsd: p.riskUsd, riskPct: p.riskPct, rr: p.rr,
      sl: p.initSl, tp: p.tp, eqBefore: p.eqBefore, pnlPct: pnl / p.eqBefore * 100
    };
    this.trades.push(t); this.pos = null;
    if (this.onClose) this.onClose(t);
    return t;
  }
  // Revisa stop / objetivo dentro de la vela respetando el orden real de máximo y mínimo
  onCandle(c, bar) {
    const p = this.pos; if (!p) return null;
    const slR = () => (p.trail && p.sl !== p.initSl) ? 'Trailing stop' : 'Stop loss';
    if (p.side > 0) {
      if (p.sl != null && c.o <= p.sl) return this.close(c.o, bar, slR() + ' (hueco)');
      if (p.tp != null && c.o >= p.tp) return this.close(c.o, bar, 'Take profit (hueco)');
      const hitTp = p.tp != null && c.h >= p.tp, hitSl = p.sl != null && c.l <= p.sl;
      if (hitTp && hitSl) return c.hiFirst ? this.close(p.tp, bar, 'Take profit') : this.close(p.sl, bar, slR());
      if (hitSl) return this.close(p.sl, bar, slR());
      if (hitTp) return this.close(p.tp, bar, 'Take profit');
      if (p.trail && p.sl != null) p.sl = Math.max(p.sl, c.h - p.trail);
    } else {
      if (p.sl != null && c.o >= p.sl) return this.close(c.o, bar, slR() + ' (hueco)');
      if (p.tp != null && c.o <= p.tp) return this.close(c.o, bar, 'Take profit (hueco)');
      const hitSl = p.sl != null && c.h >= p.sl, hitTp = p.tp != null && c.l <= p.tp;
      if (hitTp && hitSl) return c.hiFirst ? this.close(p.sl, bar, slR()) : this.close(p.tp, bar, 'Take profit');
      if (hitSl) return this.close(p.sl, bar, slR());
      if (hitTp) return this.close(p.tp, bar, 'Take profit');
      if (p.trail && p.sl != null) p.sl = Math.min(p.sl, c.l + p.trail);
    }
    return null;
  }
  mark(price) {
    const e = this.equity(price);
    if (e > this.peak) this.peak = e;
    const dd = (this.peak - e) / this.peak;
    if (dd > this.maxDD) this.maxDD = dd;
    this.curve.push(e);
    return e;
  }
}

/* ---------- Reglas del bot ---------- */
const OPERANDS = {
  close: { label: 'Precio' },
  sma: { label: 'SMA', n: 20 },
  ema: { label: 'EMA', n: 20 },
  rsi: { label: 'RSI', n: 14 },
  macd: { label: 'MACD (línea)' },
  macds: { label: 'MACD (señal)' },
  macdh: { label: 'MACD (histograma)' },
  bbu: { label: 'Bollinger superior', n: 20 },
  bbm: { label: 'Bollinger media', n: 20 },
  bbl: { label: 'Bollinger inferior', n: 20 },
  dch: { label: 'Máximo de N velas', n: 20 },
  dcl: { label: 'Mínimo de N velas', n: 20 },
  atr: { label: 'ATR', n: 14 },
  vol: { label: 'Volumen' },
  volma: { label: 'Volumen medio', n: 20 },
  value: { label: 'Valor fijo', v: 50 }
};
const OPS = { '>': 'mayor que', '<': 'menor que', xup: 'cruza hacia arriba', xdn: 'cruza hacia abajo' };

function seriesFor(candles, spec, cache) {
  const def = OPERANDS[spec.t] || {};
  const n = Math.max(1, Math.round(spec.n || def.n || 14));
  const key = spec.t + ':' + n + ':' + (spec.t === 'value' ? spec.v : '');
  if (cache[key]) return cache[key];
  const C = cache._C || (cache._C = candles.map(c => c.c));
  let s;
  switch (spec.t) {
    case 'close': s = C; break;
    case 'sma': s = Ind.sma(C, n); break;
    case 'ema': s = Ind.ema(C, n); break;
    case 'rsi': s = Ind.rsi(C, n); break;
    case 'macd': case 'macds': case 'macdh': {
      const m = cache._macd || (cache._macd = Ind.macd(C));
      s = spec.t === 'macd' ? m.line : spec.t === 'macds' ? m.signal : m.hist; break;
    }
    case 'bbu': case 'bbm': case 'bbl': {
      const b = cache['_bb' + n] || (cache['_bb' + n] = Ind.bollinger(C, n));
      s = spec.t === 'bbu' ? b.up : spec.t === 'bbm' ? b.mid : b.lo; break;
    }
    case 'dch': s = Ind.dcHigh(candles, n); break;
    case 'dcl': s = Ind.dcLow(candles, n); break;
    case 'atr': s = Ind.atr(candles, n); break;
    case 'vol': s = candles.map(c => c.v); break;
    case 'volma': s = Ind.sma(candles.map(c => c.v), n); break;
    case 'value': s = new Array(candles.length).fill(+spec.v); break;
    default: s = new Array(candles.length).fill(NaN);
  }
  cache[key] = s;
  return s;
}

function operandLabel(spec) {
  const d = OPERANDS[spec.t]; if (!d) return '?';
  if (spec.t === 'value') return String(spec.v);
  return d.n !== undefined ? `${d.label} ${spec.n || d.n}` : d.label;
}
const condText = c => `${operandLabel(c.a)} ${OPS[c.op]} ${operandLabel(c.b)}`;

function buildEvaluator(candles, rules) {
  const cache = {};
  const condFn = cond => {
    const A = seriesFor(candles, cond.a, cache), B = seriesFor(candles, cond.b, cache);
    return i => {
      const a = A[i], b = B[i];
      if (!isNum(a) || !isNum(b)) return false;
      if (cond.op === '>') return a > b;
      if (cond.op === '<') return a < b;
      if (i < 1) return false;
      const pa = A[i - 1], pb = B[i - 1];
      if (!isNum(pa) || !isNum(pb)) return false;
      return cond.op === 'xup' ? (pa <= pb && a > b) : (pa >= pb && a < b);
    };
  };
  const all = list => { const f = (list || []).map(condFn); return i => f.length > 0 && f.every(g => g(i)); };
  const any = list => { const f = (list || []).map(condFn); return i => f.some(g => g(i)); };
  return {
    long: all(rules.long), short: all(rules.short),
    exitLong: any(rules.exitLong), exitShort: any(rules.exitShort),
    atr: Ind.atr(candles, 14)
  };
}

// Ejecuta la lógica del bot al cierre de la vela i
function botStep(eng, ev, candles, i, cfg) {
  const price = candles[i].c;
  const p = eng.pos;
  if (p && p.source !== 'bot') return; // no toca posiciones manuales
  let reverse = false;
  if (p) {
    const exit = (p.side > 0 && ev.exitLong(i)) || (p.side < 0 && ev.exitShort(i));
    reverse = cfg.reverse && ((p.side > 0 && cfg.allowShort && ev.short(i)) || (p.side < 0 && cfg.allowLong && ev.long(i)));
    if (exit || reverse) eng.close(price, i, exit ? 'Señal de salida' : 'Señal contraria');
    if (!reverse) return;
  }
  if (eng.pos) return;
  let side = 0;
  if (cfg.allowLong && ev.long(i)) side = 1;
  else if (cfg.allowShort && ev.short(i)) side = -1;
  if (!side) return;
  const atr = ev.atr[i]; if (!isNum(atr) || atr <= 0) return;
  const slDist = atr * Math.max(0.5, cfg.slAtr);
  const eq = eng.equity(price);
  let qty = eq * cfg.riskPct / 100 / slDist;
  const maxQty = eq * eng.maxLev / price;
  if (qty > maxQty) qty = maxQty;
  const riskUsd = qty * slDist;
  eng.open({
    side, price, qty, bar: i, source: 'bot',
    sl: price - side * slDist,
    tp: cfg.tpAtr > 0 ? price + side * atr * cfg.tpAtr : null,
    trail: cfg.trail ? slDist : null,
    riskUsd, riskPct: riskUsd / eq * 100,
    rr: cfg.tpAtr > 0 ? cfg.tpAtr / Math.max(0.5, cfg.slAtr) : null,
    eqBefore: eq
  });
}

function runBacktest(candles, rules, cfg, start) {
  const cap = Settings.capital;
  const eng = new Engine(cap, Settings.fee, Settings.maxLev);
  const ev = buildEvaluator(candles, rules);
  for (let i = start; i < candles.length; i++) {
    eng.onCandle(candles[i], i);
    botStep(eng, ev, candles, i, cfg);
    eng.mark(candles[i].c);
  }
  const L = candles.length - 1;
  if (eng.pos) { eng.close(candles[L].c, L, 'Fin del test'); eng.curve[eng.curve.length - 1] = eng.cash; }
  return {
    trades: eng.trades, ret: (eng.cash / cap - 1) * 100, maxDD: eng.maxDD * 100, curve: eng.curve,
    bh: (candles[L].c / candles[start - 1].c - 1) * 100,
    prices: candles.slice(start - 1).map(c => c.c)
  };
}

/* ---------- Estadísticas de operaciones ---------- */
function tradeStats(trades, capital = Settings.capital) {
  const n = trades.length;
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
  const gw = sum(wins.map(t => t.pnl)), gl = -sum(losses.map(t => t.pnl));
  const Rs = trades.filter(t => isNum(t.R)).map(t => t.R);
  let eq = capital, peak = capital, mdd = 0; const curve = [capital];
  for (const t of trades) { eq += t.pnl; curve.push(eq); if (eq > peak) peak = eq; mdd = Math.max(mdd, (peak - eq) / peak); }
  return {
    n, wins: wins.length, losses: losses.length,
    wr: n ? wins.length / n * 100 : NaN,
    pnl: gw - gl,
    pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : NaN),
    avgW: wins.length ? gw / wins.length : NaN,
    avgL: losses.length ? -gl / losses.length : NaN,
    exp: n ? (gw - gl) / n : NaN,
    avgR: Rs.length ? mean(Rs) : NaN,
    maxDD: mdd * 100, curve,
    best: n ? Math.max(...trades.map(t => t.pnl)) : NaN,
    worst: n ? Math.min(...trades.map(t => t.pnl)) : NaN,
    avgBars: n ? mean(trades.map(t => t.bars || 0)) : NaN
  };
}

/* ---------- Probabilidad ---------- */
function normPdf(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
function normCdf(x) {
  // Abramowitz & Stegun 7.1.26
  const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}
const _lf = [0];
function lnFact(n) { for (let i = _lf.length; i <= n; i++) _lf[i] = _lf[i - 1] + Math.log(i); return _lf[n]; }
function binomTailGE(k, n, p = 0.5) {
  if (k <= 0) return 1;
  let s = 0;
  for (let i = k; i <= n; i++) s += Math.exp(lnFact(n) - lnFact(i) - lnFact(n - i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, s);
}
function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
// Probabilidad de al menos una racha de k fracasos seguidos en n intentos
function streakProb(n, k, q) {
  let f = new Array(k).fill(0); f[0] = 1; let reached = 0;
  for (let t = 0; t < n; t++) {
    const nf = new Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      if (!f[j]) continue;
      nf[0] += f[j] * (1 - q);
      if (j + 1 >= k) reached += f[j] * q; else nf[j + 1] += f[j] * q;
    }
    f = nf;
  }
  return reached;
}
