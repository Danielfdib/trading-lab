'use strict';
/* =========================================================
   Laboratorio de opciones (Black-Scholes)
   ========================================================= */

function bs(type, S, K, T, r, v) {
  if (type === 'stock') return { price: S, delta: 1, gamma: 0, theta: 0, vega: 0 };
  if (T <= 1e-9 || v <= 0) {
    const intr = type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intr, delta: type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0 };
  }
  const sq = Math.sqrt(T), d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * sq), d2 = d1 - v * sq;
  const df = Math.exp(-r * T), pdf = normPdf(d1);
  const gamma = pdf / (S * v * sq), vega = S * pdf * sq / 100;
  if (type === 'call') return {
    price: S * normCdf(d1) - K * df * normCdf(d2), delta: normCdf(d1), gamma, vega,
    theta: (-S * pdf * v / (2 * sq) - r * K * df * normCdf(d2)) / 365
  };
  return {
    price: K * df * normCdf(-d2) - S * normCdf(-d1), delta: normCdf(d1) - 1, gamma, vega,
    theta: (-S * pdf * v / (2 * sq) + r * K * df * normCdf(-d2)) / 365
  };
}

const LEG = (type, side, pct, qty = 1) => ({ type, side, pct, qty });
const OPT_PRESETS = {
  long_call: { name: 'Compra de call', view: 'Alcista', legs: [LEG('call', 1, 0)],
    desc: 'Pagas una prima por el derecho a comprar al strike. <b>Pérdida máxima = la prima</b>; ganancia ilimitada si el precio sube mucho. Necesitas que suba más que la prima pagada antes del vencimiento.' },
  long_put: { name: 'Compra de put', view: 'Bajista', legs: [LEG('put', 1, 0)],
    desc: 'Derecho a vender al strike. Ganas si el precio cae por debajo de strike − prima. <b>Pérdida máxima = la prima.</b> También sirve como seguro de una cartera.' },
  bull_call: { name: 'Bull call spread', view: 'Alcista', legs: [LEG('call', 1, 0), LEG('call', -1, 0.05)],
    desc: 'Compras una call y vendes otra con strike más alto. Más barata que la call sola, pero la ganancia queda limitada. <b>Riesgo y beneficio definidos.</b>' },
  bear_put: { name: 'Bear put spread', view: 'Bajista', legs: [LEG('put', 1, 0), LEG('put', -1, -0.05)],
    desc: 'Compras una put y vendes otra con strike más bajo. Apuesta bajista barata con <b>riesgo y beneficio limitados</b>.' },
  covered_call: { name: 'Covered call (venta cubierta)', view: 'Neutral / ligeramente alcista', legs: [LEG('stock', 1, 0), LEG('call', -1, 0.05)],
    desc: 'Tienes 100 acciones y vendes una call por encima del precio: cobras prima a cambio de limitar la subida. Genera ingresos en mercados tranquilos; <b>sigues expuesto a caídas</b>.' },
  protective_put: { name: 'Put protectora', view: 'Alcista con seguro', legs: [LEG('stock', 1, 0), LEG('put', 1, -0.05)],
    desc: 'Tienes 100 acciones y compras una put como <b>seguro</b>: si el precio se desploma, tu pérdida queda limitada. El costo es la prima.' },
  short_put: { name: 'Venta de put', view: 'Neutral / alcista', legs: [LEG('put', -1, -0.05)],
    desc: 'Cobras prima y te comprometes a comprar al strike si el precio cae. Alta probabilidad de ganar poco, <b>pero la pérdida puede ser grande</b> si el precio se hunde.' },
  long_straddle: { name: 'Long straddle', view: 'Gran movimiento (cualquier dirección)', legs: [LEG('call', 1, 0), LEG('put', 1, 0)],
    desc: 'Compras call y put al mismo strike. Ganas si el precio <b>se mueve mucho</b> en cualquier dirección (p. ej. antes de resultados). Pierdes si se queda quieto: el tiempo juega en contra.' },
  long_strangle: { name: 'Long strangle', view: 'Gran movimiento', legs: [LEG('call', 1, 0.05), LEG('put', 1, -0.05)],
    desc: 'Como el straddle pero con strikes fuera del dinero: más barato, necesita un movimiento aún mayor.' },
  short_straddle: { name: 'Short straddle', view: 'Mercado quieto', legs: [LEG('call', -1, 0), LEG('put', -1, 0)],
    desc: 'Vendes call y put: cobras mucha prima y ganas si el precio <b>no se mueve</b>. ⚠ Pérdida ilimitada si hay un movimiento fuerte. Solo para entender el riesgo.' },
  iron_condor: { name: 'Iron condor', view: 'Mercado en rango', legs: [LEG('put', 1, -0.10), LEG('put', -1, -0.05), LEG('call', -1, 0.05), LEG('call', 1, 0.10)],
    desc: 'Vendes un strangle y compras alas de protección. Ganas la prima si el precio <b>se queda entre los strikes vendidos</b>. Riesgo limitado, probabilidad alta, ganancia pequeña.' },
  butterfly: { name: 'Mariposa con calls', view: 'Precio fijo en un objetivo', legs: [LEG('call', 1, -0.05), LEG('call', -1, 0, 2), LEG('call', 1, 0.05)],
    desc: 'Compra 1 call baja, vende 2 en el centro y compra 1 alta. Muy barata; gana el máximo si el precio termina <b>justo en el strike central</b>.' },
  custom: { name: 'Personalizada', view: 'Tú decides', legs: null, desc: 'Combina las patas que quieras: añade, elimina o cambia tipo, lado, strike y cantidad.' }
};

const Opt = {
  S: 100, iv: 30, days: 30, r: 4, legs: [], preset: 'long_call', an: null, busy: false, path: null,

  init() {
    $('#optPreset').innerHTML = Object.entries(OPT_PRESETS).map(([k, p]) => `<option value="${k}">${p.name} — ${p.view}</option>`).join('');
    $('#optPreset').onchange = e => this.applyPreset(e.target.value);
    const num = (id, key, min) => $(id).addEventListener('input', e => {
      const v = parseFloat(e.target.value); if (!isNum(v) || v < min) return;
      this[key] = v;
      if (key === 'S' && this.preset !== 'custom') this.applyPreset(this.preset); else this.analyze();
    });
    num('#optS', 'S', 0.5); num('#optIV', 'iv', 1); num('#optDays', 'days', 1); num('#optR', 'r', -5);
    $('#optUseSim').onclick = () => {
      this.S = +Sim.last().c.toFixed(2); $('#optS').value = this.S;
      if (this.preset !== 'custom') this.applyPreset(this.preset); else this.analyze();
      toast(`Precio del subyacente: ${this.S}`, 'info', 2000);
    };
    $('#optLegs').addEventListener('change', e => this.onLegChange(e));
    $('#optLegs').addEventListener('click', e => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      this.legs.splice(+b.dataset.rm, 1); this.toCustom(); this.renderLegs(); this.analyze();
    });
    $('#optAddLeg').onclick = () => { this.legs.push({ type: 'call', side: 1, K: this.strike(0), qty: 1 }); this.toCustom(); this.renderLegs(); this.analyze(); };
    $('#optSim').onclick = () => this.simPath();
    $('#optSimMany').onclick = () => this.simMany();
    this.applyPreset('long_call');
  },
  step() { const S = this.S; return S < 25 ? 0.5 : S < 100 ? 1 : S < 250 ? 2.5 : 5; },
  strike(pct) { const st = this.step(); return Math.max(st, Math.round(this.S * (1 + pct) / st) * st); },
  toCustom() { this.preset = 'custom'; $('#optPreset').value = 'custom'; $('#optDesc').innerHTML = `<b>Vista: tú decides.</b> ${OPT_PRESETS.custom.desc}`; },
  applyPreset(k) {
    this.preset = k; const p = OPT_PRESETS[k];
    if (p.legs) this.legs = p.legs.map(l => ({ type: l.type, side: l.side, K: l.type === 'stock' ? null : this.strike(l.pct), qty: l.qty }));
    $('#optPreset').value = k;
    $('#optDesc').innerHTML = `<b>Vista: ${p.view}.</b> ${p.desc}`;
    this.renderLegs(); this.analyze();
  },
  renderLegs() {
    $('#optLegs').innerHTML = `<tr><th>Tipo</th><th>Lado</th><th>Strike</th><th>Cant.</th><th class="num">Prima</th><th></th></tr>` +
      this.legs.map((g, i) => `<tr data-i="${i}">
        <td><select data-f="type">${[['call', 'Call'], ['put', 'Put'], ['stock', 'Acciones ×100']].map(([v, t]) => `<option value="${v}" ${g.type === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><select data-f="side"><option value="1" ${g.side > 0 ? 'selected' : ''}>Compra</option><option value="-1" ${g.side < 0 ? 'selected' : ''}>Venta</option></select></td>
        <td>${g.type === 'stock' ? '<span class="muted small">—</span>' : `<input type="number" data-f="K" value="${g.K}" step="${this.step()}" min="0.5">`}</td>
        <td><input type="number" class="q" data-f="qty" value="${g.qty}" min="1" step="1"></td>
        <td class="num" data-prem="${i}">—</td>
        <td><button class="mini" data-rm="${i}" title="Quitar">✕</button></td>
      </tr>`).join('');
  },
  onLegChange(e) {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const g = this.legs[+tr.dataset.i], f = e.target.dataset.f, v = e.target.value;
    if (f === 'type') { g.type = v; g.K = v === 'stock' ? null : (g.K || this.strike(0)); this.toCustom(); this.renderLegs(); }
    else if (f === 'side') g.side = +v;
    else if (f === 'K') g.K = Math.max(0.5, +v || this.strike(0));
    else if (f === 'qty') g.qty = Math.max(1, Math.round(+v || 1));
    this.toCustom(); this.analyze();
  },
  T() { return this.days / 365; }, sig() { return this.iv / 100; }, rr() { return this.r / 100; },
  value(S, Trem, vol = this.sig()) {
    let v = 0;
    for (const g of this.legs) {
      const now = g.type === 'stock' ? S : bs(g.type, S, g.K, Trem, this.rr(), vol).price;
      v += g.side * g.qty * 100 * (now - g.prem);
    }
    return v;
  },
  analyze() {
    const S = this.S, T = this.T(), v = this.sig(), r = this.rr();
    const G = { delta: 0, gamma: 0, theta: 0, vega: 0 }; let net = 0;
    for (const g of this.legs) {
      const b = bs(g.type, S, g.K, T, r, v);
      g.prem = g.type === 'stock' ? S : b.price;
      net += g.side * g.qty * 100 * g.prem;
      for (const k in G) G[k] += g.side * g.qty * 100 * b[k];
    }
    this.legs.forEach((g, i) => { const c = $(`[data-prem="${i}"]`); if (c) c.textContent = g.type === 'stock' ? S.toFixed(2) : g.prem.toFixed(2); });
    if (!this.legs.length) { $('#optMetrics').innerHTML = '<div class="muted">Añade al menos una pata.</div>'; prepCanvas($('#optPayoff')); this.an = null; return; }

    // Ganancia / pérdida máxima y breakevens al vencimiento
    let maxP = -Infinity, minP = Infinity;
    for (let k = 0; k <= 800; k++) { const x = S * (0.01 + k / 800 * 3); const p = this.value(x, 0); if (p > maxP) maxP = p; if (p < minP) minP = p; }
    const far = this.value(S * 10, 0), zero = this.value(0.0001, 0);
    const unlimP = far > maxP + 1, unlimL = far < minP - 1;
    maxP = Math.max(maxP, zero); minP = Math.min(minP, zero);
    const bes = [];
    let prev = this.value(S * 0.2, 0);
    for (let k = 1; k <= 2000; k++) {
      const x = S * (0.2 + k / 2000 * 2.3), p = this.value(x, 0);
      if ((prev < 0 && p >= 0) || (prev > 0 && p <= 0)) { const x0 = S * (0.2 + (k - 1) / 2000 * 2.3); bes.push(x0 + (x - x0) * (-prev) / (p - prev || 1)); }
      prev = p;
    }
    // Probabilidad de ganancia y valor esperado (precio log-normal)
    const m = Math.log(S) + (r - v * v / 2) * T, sd = v * Math.sqrt(T);
    let pop = 0, ev = 0; const N = 3000, dz = 12 / N;
    for (let k = 0; k <= N; k++) { const z = -6 + k * dz, w = normPdf(z) * dz, p = this.value(Math.exp(m + sd * z), 0); if (p > 0) pop += w; ev += w * p; }
    this.an = { net, maxP, minP, unlimP, unlimL, bes, pop, ev, G };

    const riskTxt = unlimL ? 'Ilimitada' : fmt.money(minP, 0);
    $('#optMetrics').innerHTML = `
      ${metric(net >= 0 ? 'Costo neto (pagas)' : 'Crédito neto (recibes)', fmt.money(Math.abs(net), 0), net >= 0 ? '' : 'pos')}
      ${metric('Ganancia máxima', unlimP ? 'Ilimitada' : fmt.money(maxP, 0), 'pos')}
      ${metric('Pérdida máxima', riskTxt, 'neg')}
      ${metric('Breakeven', bes.length ? bes.map(b => b.toFixed(2)).join(' / ') : '—', bes.length > 1 ? 'wrap' : '')}
      ${metric('Prob. de ganar <i class="tip" data-tip="Probabilidad de terminar con ganancia al vencimiento si el precio se mueve con la volatilidad implícita (modelo log-normal).">?</i>', fmt.pct(pop * 100, 1), pop >= 0.5 ? 'pos' : '')}
      ${metric('Delta <i class="tip" data-tip="Cuánto ganas/pierdes por cada $1 que sube el subyacente.">?</i>', fmt.num(G.delta, 1))}
      ${metric('Theta / día <i class="tip" data-tip="Cuánto gana o pierde la posición cada día que pasa, si nada más cambia. Negativo = el tiempo juega en tu contra.">?</i>', fmt.smoney(G.theta), cls(G.theta))}
      ${metric('Vega <i class="tip" data-tip="Cuánto cambia el valor si la volatilidad implícita sube 1 punto.">?</i>', fmt.smoney(G.vega), cls(G.vega))}`;
    this.drawPayoff();
  },
  xRange() {
    const S = this.S, sd = this.sig() * Math.sqrt(this.T());
    let lo = S * Math.exp(-3.2 * sd), hi = S * Math.exp(3.2 * sd);
    const Ks = this.legs.filter(g => g.K).map(g => g.K);
    if (Ks.length) { lo = Math.min(lo, Math.min(...Ks) * 0.92); hi = Math.max(hi, Math.max(...Ks) * 1.08); }
    lo = Math.min(lo, S * 0.85); hi = Math.max(hi, S * 1.15);
    return [Math.max(0.01, lo), hi];
  },
  drawPayoff() {
    if (!this.an) return;
    const C = themeColors(), [lo, hi] = this.xRange(), xs = [], exp = [], now = [], mid = [], T = this.T();
    for (let k = 0; k <= 300; k++) { const x = lo + (hi - lo) * k / 300; xs.push(x); exp.push(this.value(x, 0)); now.push(this.value(x, T)); mid.push(this.value(x, T / 2)); }
    const sd = this.sig() * Math.sqrt(T);
    const strikes = [...new Set(this.legs.filter(g => g.K).map(g => g.K))];
    plotXY($('#optPayoff'), {
      xMin: lo, xMax: hi, padL: 66,
      vspans: [{ x0: this.S * Math.exp(-sd), x1: this.S * Math.exp(sd), color: C.accent, alpha: 0.08 }],
      series: [
        { xs, ys: mid, color: C.accent, width: 1, alpha: 0.4, dash: [2, 3] },
        { xs, ys: now, color: C.accent, width: 1.6, dash: [6, 4] },
        { xs, ys: exp, color: C.strong, width: 2.2, fillZero: true }
      ],
      hlines: [{ y: 0, color: C.faint, dash: [], include: true }],
      vlines: [
        { x: this.S, color: C.warn, label: 'Actual ' + this.S.toFixed(2) },
        ...this.an.bes.map((b, i) => ({ x: b, color: C.text, label: 'BE ' + b.toFixed(2), row: i + 1, dash: [2, 3] })),
        ...strikes.map(k => ({ x: k, color: C.c3, alpha: 0.35, dash: [1, 3] }))
      ],
      yFmt: v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(0), xFmt: v => v.toFixed(0)
    });
  },
  simParams(rng) {
    const iv = this.sig(), vm = $('#optRealVol').value, dm = $('#optDrift').value;
    const vol = vm === 'same' ? iv : vm === 'low' ? iv * 0.6 : vm === 'high' ? iv * 1.6 : iv * rng.range(0.5, 1.7);
    const mu = dm === 'up' ? 0.6 : dm === 'down' ? -0.6 : dm === 'rand' ? rng.range(-0.8, 0.8) : 0;
    return { vol, mu };
  },
  simPath() {
    if (this.busy || !this.an) return;
    this.busy = true; $('#optSim').disabled = true;
    const rng = new RNG(randomSeed()), { vol, mu } = this.simParams(rng), days = Math.round(this.days), dt = 1 / 365;
    const path = [this.S], pnl = [0];
    let t = 0, S = this.S;
    const C = themeColors(), sd = this.sig() * Math.sqrt(this.T());
    const yLo = Math.min(this.S * Math.exp(-3 * sd), ...this.legs.filter(g => g.K).map(g => g.K * 0.97));
    const yHi = Math.max(this.S * Math.exp(3 * sd), ...this.legs.filter(g => g.K).map(g => g.K * 1.03));
    const strikes = [...new Set(this.legs.filter(g => g.K).map(g => g.K))];
    const draw = () => {
      const xs = path.map((_, i) => i);
      plotXY($('#optPath'), {
        xMin: 0, xMax: days, yMin: Math.min(yLo, ...path) * 0.99, yMax: Math.max(yHi, ...path) * 1.01, padL: 52,
        series: [{ xs, ys: path, color: C.accent, width: 2 }],
        hlines: [...strikes.map(k => ({ y: k, color: C.c3, label: 'K ' + k, alpha: 0.6 })), ...this.an.bes.map(b => ({ y: b, color: C.text, label: 'BE', dash: [2, 3], alpha: 0.6 }))],
        xFmt: v => 'd' + Math.round(v), yFmt: v => v.toFixed(0)
      });
      plotXY($('#optPnl'), {
        xMin: 0, xMax: days, padL: 62,
        series: [{ xs, ys: pnl, color: C.strong, width: 2, fillZero: true }],
        hlines: [{ y: 0, color: C.faint, dash: [], include: true }],
        xFmt: v => 'd' + Math.round(v), yFmt: v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(0)
      });
    };
    const delay = clamp(3500 / days, 15, 120);
    const tick = () => {
      t++;
      S *= Math.exp((mu - vol * vol / 2) * dt + vol * Math.sqrt(dt) * rng.normal());
      path.push(S); pnl.push(this.value(S, Math.max(0, (days - t) / 365)));
      draw();
      $('#optResult').innerHTML = `Día <b>${t}</b> de ${days} · Precio <b>${S.toFixed(2)}</b> · Tu posición: <b class="${cls(pnl[t])}">${fmt.smoney(pnl[t])}</b>`;
      if (t < days) setTimeout(tick, delay);
      else {
        const fin = pnl[t], risk = this.an.unlimL ? null : -this.an.minP;
        const move = (S / this.S - 1) * 100;
        $('#optResult').innerHTML = `${fin > 0 ? '✅' : '❌'} <b>Al vencimiento</b> el subyacente terminó en <b>${S.toFixed(2)}</b> (${fmt.spct(move)}). Resultado: <b class="${cls(fin)}">${fmt.smoney(fin)}</b>${risk ? ` (${fmt.spct(fin / risk * 100, 0)} sobre el riesgo máximo)` : ''}.
          <span class="muted small">Volatilidad real usada: ${(vol * 100).toFixed(0)}% vs. implícita ${this.iv}%. ${vol > this.sig() * 1.15 ? 'Hubo más movimiento del que el mercado esperaba: favorece a quien compra opciones.' : vol < this.sig() * 0.85 ? 'Hubo menos movimiento del esperado: favorece a quien vende opciones.' : ''}</span>`;
        this.busy = false; $('#optSim').disabled = false;
      }
    };
    draw(); setTimeout(tick, 100);
  },
  simMany() {
    if (!this.an) return;
    const rng = new RNG(randomSeed()), T = this.T(), N = 2000, res = [];
    for (let k = 0; k < N; k++) {
      const { vol, mu } = this.simParams(rng);
      const ST = this.S * Math.exp((mu - vol * vol / 2) * T + vol * Math.sqrt(T) * rng.normal());
      res.push(this.value(ST, 0));
    }
    const sorted = res.slice().sort((a, b) => a - b), win = res.filter(v => v > 0).length / N * 100, avg = mean(res);
    $('#optManyBox').classList.remove('hidden');
    $('#optManyMetrics').innerHTML = `
      ${metric('Simulaciones ganadoras', fmt.pct(win, 1), win >= 50 ? 'pos' : 'neg', `teórica: ${fmt.pct(this.an.pop * 100, 1)}`)}
      ${metric('Resultado medio', fmt.smoney(avg, 0), cls(avg))}
      ${metric('Mediana', fmt.smoney(percentile(sorted, 0.5), 0), cls(percentile(sorted, 0.5)))}
      ${metric('Peor 5%', fmt.smoney(percentile(sorted, 0.05), 0), 'neg')}
      ${metric('Mejor 5%', fmt.smoney(percentile(sorted, 0.95), 0), 'pos')}`;
    const C = themeColors();
    plotHist($('#optHist'), res, { bins: 40, colorFn: v => v > 0 ? C.up : C.down, xFmt: v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(0), vlines: [{ x: 0, color: C.faint }, { x: avg, color: C.warn, label: 'media', row: 0 }] });
    const dm = $('#optDrift').value, vm = $('#optRealVol').value;
    $('#optManyText').innerHTML = `Con ${N} futuros posibles, ganaste en el ${win.toFixed(1)}% de los casos. ` +
      (dm === 'flat' && vm === 'same' ? 'Como la volatilidad real coincide con la implícita y no hay tendencia, el resultado medio ronda $0: <b>el precio de una opción ya “descuenta” el movimiento esperado</b>. Para ganar con opciones necesitas acertar algo que el mercado no espera (dirección o volatilidad).'
        : 'Cambia “Movimiento” y “Volatilidad real” para ver cómo afecta cada escenario a esta estrategia.');
  },
  onShow() { this.drawPayoff(); }
};
