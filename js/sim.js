'use strict';
/* =========================================================
   Simulador: trading manual + bot de reglas
   ========================================================= */

const DEFAULT_BOT_CFG = { riskPct: 1, slAtr: 2, tpAtr: 0, trail: false, reverse: false, allowLong: true, allowShort: true };
const C_ = (a, op, b) => ({ a, op, b });
const PRESETS = {
  ma_cross: {
    name: 'Cruce de medias (SMA 20 / 50)',
    desc: '<b>Seguimiento de tendencia.</b> Compra cuando la media rápida (20) cruza por encima de la lenta (50) y vende en corto cuando cruza por debajo. Gana mucho en tendencias largas y pierde poco a poco en mercados laterales (señales falsas). Usa trailing stop para dejar correr las ganancias.',
    rules: { long: [C_({ t: 'sma', n: 20 }, 'xup', { t: 'sma', n: 50 })], short: [C_({ t: 'sma', n: 20 }, 'xdn', { t: 'sma', n: 50 })], exitLong: [], exitShort: [] },
    cfg: { slAtr: 2.5, tpAtr: 0, trail: true, reverse: true }
  },
  rsi_rev: {
    name: 'Reversión con RSI (30 / 70)',
    desc: '<b>Reversión a la media.</b> Cuando el RSI sale de sobreventa (cruza 30 hacia arriba) compra; cuando sale de sobrecompra (cruza 70 hacia abajo) vende. Sale cuando el RSI vuelve a la zona neutral. Funciona en rangos; sufre en tendencias fuertes.',
    rules: { long: [C_({ t: 'rsi', n: 14 }, 'xup', { t: 'value', v: 30 })], short: [C_({ t: 'rsi', n: 14 }, 'xdn', { t: 'value', v: 70 })], exitLong: [C_({ t: 'rsi', n: 14 }, '>', { t: 'value', v: 60 })], exitShort: [C_({ t: 'rsi', n: 14 }, '<', { t: 'value', v: 40 })] },
    cfg: { slAtr: 1.5, tpAtr: 3, trail: false, reverse: false }
  },
  bb_bounce: {
    name: 'Rebote en Bandas de Bollinger',
    desc: '<b>Reversión a la media.</b> Compra cuando el precio vuelve a entrar por encima de la banda inferior y vende cuando vuelve a entrar por debajo de la superior. Sale al tocar la media de 20. Ideal en mercados laterales.',
    rules: { long: [C_({ t: 'close' }, 'xup', { t: 'bbl', n: 20 })], short: [C_({ t: 'close' }, 'xdn', { t: 'bbu', n: 20 })], exitLong: [C_({ t: 'close' }, '>', { t: 'bbm', n: 20 })], exitShort: [C_({ t: 'close' }, '<', { t: 'bbm', n: 20 })] },
    cfg: { slAtr: 1.5, tpAtr: 0, trail: false, reverse: false }
  },
  breakout: {
    name: 'Ruptura de máximos (Donchian 20)',
    desc: '<b>Breakout / tortugas.</b> Compra cuando el precio supera el máximo de las 20 velas anteriores y vende en corto cuando rompe el mínimo. Sale cuando rompe el extremo contrario de 10 velas. Pocas operaciones ganadoras pero grandes.',
    rules: { long: [C_({ t: 'close' }, '>', { t: 'dch', n: 20 })], short: [C_({ t: 'close' }, '<', { t: 'dcl', n: 20 })], exitLong: [C_({ t: 'close' }, '<', { t: 'dcl', n: 10 })], exitShort: [C_({ t: 'close' }, '>', { t: 'dch', n: 10 })] },
    cfg: { slAtr: 2, tpAtr: 0, trail: true, reverse: false }
  },
  macd: {
    name: 'Cruce de MACD',
    desc: '<b>Momentum.</b> Compra cuando la línea MACD cruza por encima de su señal y vende cuando cruza por debajo. Reacciona antes que el cruce de medias, pero genera más señales falsas.',
    rules: { long: [C_({ t: 'macd' }, 'xup', { t: 'macds' })], short: [C_({ t: 'macd' }, 'xdn', { t: 'macds' })], exitLong: [], exitShort: [] },
    cfg: { slAtr: 2, tpAtr: 4, trail: false, reverse: true }
  },
  pullback: {
    name: 'Tendencia + retroceso',
    desc: '<b>Comprar barato dentro de una tendencia.</b> Solo compra si el precio está por encima de la EMA 100 (tendencia alcista) y el RSI rebota desde 40 (retroceso terminado). Lo opuesto para cortos. Combina filtro de tendencia con entrada en descuento.',
    rules: { long: [C_({ t: 'close' }, '>', { t: 'ema', n: 100 }), C_({ t: 'rsi', n: 14 }, 'xup', { t: 'value', v: 40 })], short: [C_({ t: 'close' }, '<', { t: 'ema', n: 100 }), C_({ t: 'rsi', n: 14 }, 'xdn', { t: 'value', v: 60 })], exitLong: [], exitShort: [] },
    cfg: { slAtr: 1.5, tpAtr: 3, trail: false, reverse: false }
  },
  custom: {
    name: 'Personalizada',
    desc: '<b>Tu propia estrategia.</b> Combina condiciones: todas las de entrada deben cumplirse a la vez; cualquiera de las de salida cierra la posición. El bot evalúa al cierre de cada vela.',
    rules: { long: [C_({ t: 'close' }, '>', { t: 'sma', n: 50 })], short: [], exitLong: [C_({ t: 'close' }, '<', { t: 'sma', n: 50 })], exitShort: [] },
    cfg: {}
  }
};
const RULE_GROUPS = [
  ['long', 'Entrar en <b class="pos">LARGO</b> cuando se cumplan <b>todas</b>:'],
  ['short', 'Entrar en <b class="neg">CORTO</b> cuando se cumplan <b>todas</b>:'],
  ['exitLong', 'Cerrar el largo si se cumple <b>alguna</b> (además del stop/objetivo):'],
  ['exitShort', 'Cerrar el corto si se cumple <b>alguna</b> (además del stop/objetivo):']
];

/* ---------------- Bot ---------------- */
const Bot = {
  rules: null, presetKey: 'ma_cross', cfgState: null,
  init() {
    const sel = $('#botPreset');
    sel.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
    const saved = Store.get('bot', null);
    if (saved && saved.rules && PRESETS[saved.presetKey]) {
      this.presetKey = saved.presetKey; this.rules = saved.rules;
      this.cfgState = Object.assign({}, DEFAULT_BOT_CFG, saved.cfg);
    } else this.loadPreset('ma_cross', false);
    sel.value = this.presetKey;
    sel.onchange = () => this.loadPreset(sel.value);
    fillScenarioSelect($('#botTestScen'), [['current', 'El mismo del gráfico'], ['mixed', 'Todos mezclados']]);
    this.writeCfg(); this.renderRules();
    $$('#botCfg input').forEach(el => el.addEventListener('change', () => { this.readCfg(); this.save(); }));
    $('#botRules').addEventListener('change', e => this.onRuleChange(e));
    $('#botRules').addEventListener('click', e => {
      const add = e.target.closest('[data-add]'), del = e.target.closest('[data-del]');
      if (add) { this.rules[add.dataset.add].push(C_({ t: 'close' }, '>', { t: 'sma', n: 50 })); this.markCustom(); this.renderRules(); this.save(); }
      if (del) { const c = del.closest('.cond'); this.rules[c.dataset.g].splice(+c.dataset.k, 1); this.markCustom(); this.renderRules(); this.save(); }
    });
    $('#botToggle').onclick = () => Sim.toggleBot();
    $('#botBacktest').onclick = () => this.backtest();
    $('#botRobust').onclick = () => this.robust();
  },
  save() { Store.set('bot', { presetKey: this.presetKey, rules: this.rules, cfg: this.cfgState }); },
  loadPreset(k, render = true) {
    const p = PRESETS[k];
    this.presetKey = k;
    this.rules = JSON.parse(JSON.stringify(p.rules));
    this.cfgState = Object.assign({}, DEFAULT_BOT_CFG, p.cfg);
    if (render) { this.writeCfg(); this.renderRules(); this.save(); $('#botResults').innerHTML = ''; }
  },
  markCustom() {
    if (this.presetKey !== 'custom') { this.presetKey = 'custom'; $('#botPreset').value = 'custom'; }
  },
  writeCfg() {
    const c = this.cfgState;
    $('#botRisk').value = c.riskPct; $('#botSl').value = c.slAtr; $('#botTp').value = c.tpAtr;
    $('#botTrail').checked = c.trail; $('#botReverse').checked = c.reverse;
    $('#botLong').checked = c.allowLong; $('#botShort').checked = c.allowShort;
  },
  readCfg() {
    const n = (id, d, min) => { const v = parseFloat($(id).value); return isNum(v) ? Math.max(min, v) : d; };
    this.cfgState = {
      riskPct: n('#botRisk', 1, 0.1), slAtr: n('#botSl', 2, 0.5), tpAtr: n('#botTp', 0, 0),
      trail: $('#botTrail').checked, reverse: $('#botReverse').checked,
      allowLong: $('#botLong').checked, allowShort: $('#botShort').checked
    };
  },
  opndHTML(f, spec) {
    const d = OPERANDS[spec.t];
    const opts = Object.entries(OPERANDS).filter(([t]) => f === 'b' || t !== 'value')
      .map(([t, o]) => `<option value="${t}" ${t === spec.t ? 'selected' : ''}>${o.label}</option>`).join('');
    let param = '';
    if (spec.t === 'value') param = `<input type="number" class="num" data-f="${f}v" value="${spec.v}" step="any" title="Valor">`;
    else if (d && d.n !== undefined) param = `<input type="number" class="num" data-f="${f}n" value="${spec.n || d.n}" min="1" max="300" title="Periodo (velas)">`;
    return `<div class="opnd"><select data-f="${f}t">${opts}</select>${param}</div>`;
  },
  renderRules() {
    const desc = PRESETS[this.presetKey].desc;
    $('#botDesc').innerHTML = desc;
    $('#botRules').innerHTML = RULE_GROUPS.map(([g, title]) => {
      const list = this.rules[g] || (this.rules[g] = []);
      const rows = list.map((cd, k) => `<div class="cond" data-g="${g}" data-k="${k}">
          ${this.opndHTML('a', cd.a)}
          <select data-f="op" class="op">${Object.entries(OPS).map(([o, t]) => `<option value="${o}" ${o === cd.op ? 'selected' : ''}>${t}</option>`).join('')}</select>
          ${this.opndHTML('b', cd.b)}
          <button class="mini del" data-del="1" title="Eliminar condición">✕</button>
        </div>`).join('');
      return `<div class="rg"><div class="rg-head">${title}</div>${rows || '<div class="muted small rg-empty">— ninguna —</div>'}<button class="mini" data-add="${g}">+ condición</button></div>`;
    }).join('');
  },
  onRuleChange(e) {
    const el = e.target, c = el.closest('.cond'); if (!c) return;
    const cd = this.rules[c.dataset.g][+c.dataset.k], f = el.dataset.f, v = el.value;
    let rerender = false;
    if (f === 'at') { cd.a = { t: v, n: OPERANDS[v].n }; rerender = true; }
    else if (f === 'bt') {
      if (v === 'value') {
        const last = Sim.market ? Sim.market.candles[Sim.market.candles.length - 1].c : 100;
        cd.b = { t: 'value', v: cd.a.t === 'rsi' ? 50 : cd.a.t.startsWith('macd') ? 0 : +last.toFixed(2) };
      } else cd.b = { t: v, n: OPERANDS[v].n };
      rerender = true;
    }
    else if (f === 'an') cd.a.n = Math.max(1, +v || 1);
    else if (f === 'bn') cd.b.n = Math.max(1, +v || 1);
    else if (f === 'bv') cd.b.v = +v || 0;
    else if (f === 'op') cd.op = v;
    this.markCustom();
    if (rerender) this.renderRules(); else $('#botDesc').innerHTML = PRESETS.custom.desc;
    this.save();
  },
  hasEntry() { return (this.rules.long.length && this.cfgState.allowLong) || (this.rules.short.length && this.cfgState.allowShort); },
  testScenario() {
    const v = $('#botTestScen').value;
    return v === 'current' ? Sim.market.scenario : v === 'mixed' ? randomScenario() : v;
  },
  backtest() {
    this.readCfg();
    if (!this.hasEntry()) return toast('Añade al menos una condición de entrada.', 'warn');
    const scen = this.testScenario();
    const cs = new Market(scen, randomSeed()).generate(650);
    const r = runBacktest(cs, this.rules, this.cfgState, 150);
    const st = tradeStats(r.trades);
    let verdict;
    if (st.n < 5) verdict = 'Muy pocas operaciones: no se puede sacar ninguna conclusión. Prueba otras reglas o más velas.';
    else if (r.ret > 0 && r.ret > r.bh) verdict = '✅ Ganó y superó a “comprar y mantener”. Pero un solo backtest puede ser suerte: ejecuta la prueba de robustez.';
    else if (r.ret > 0) verdict = 'Ganó dinero, pero menos que simplemente comprar y mantener. ¿Vale la pena el esfuerzo?';
    else verdict = '❌ Perdió en este mercado. Revisa si las reglas encajan con el tipo de mercado (tendencia vs. rango).';
    $('#botResults').innerHTML = `
      <div class="res-head">Backtest · ${SCENARIOS[scen].name} · 500 velas</div>
      <div class="metrics sm">
        ${metric('Retorno', fmt.spct(r.ret), cls(r.ret))}
        ${metric('Comprar y mantener', fmt.spct(r.bh), cls(r.bh))}
        ${metric('Operaciones', st.n)}
        ${metric('% acierto', fmt.pct(st.wr, 0))}
        ${metric('Profit factor', fmt.pf(st.pf), st.pf >= 1 ? 'pos' : 'neg')}
        ${metric('Máx. drawdown', fmt.pct(r.maxDD, 1), 'neg')}
      </div>
      <div class="mini-chart"><canvas id="botEq"></canvas></div>
      <div class="verdict">${verdict}</div>`;
    const C = themeColors(), cap = Settings.capital;
    plotXY($('#botEq'), {
      padL: 52,
      series: [
        { ys: r.prices.map(p => cap * p / r.prices[0]), color: C.faint, width: 1.2, dash: [4, 3] },
        { ys: r.curve, color: C.accent, width: 1.8 }
      ],
      hlines: [{ y: cap, color: C.faint, dash: [2, 3] }],
      yFmt: v => '$' + Math.round(v / 1000 * 10) / 10 + 'k', xFmt: v => Math.round(v)
    });
  },
  robust() {
    this.readCfg();
    if (!this.hasEntry()) return toast('Añade al menos una condición de entrada.', 'warn');
    const sv = $('#botTestScen').value, runs = 20, rows = [];
    for (let k = 0; k < runs; k++) {
      const scen = sv === 'current' ? Sim.market.scenario : sv === 'mixed' ? randomScenario() : sv;
      const cs = new Market(scen, randomSeed()).generate(650);
      const r = runBacktest(cs, this.rules, this.cfgState, 150);
      const s = tradeStats(r.trades);
      rows.push({ scen, ret: r.ret, bh: r.bh, dd: r.maxDD, n: s.n, wr: s.wr });
    }
    const rets = rows.map(r => r.ret), sorted = rets.slice().sort((a, b) => a - b);
    const prof = rows.filter(r => r.ret > 0).length, beat = rows.filter(r => r.ret > r.bh).length;
    const avg = mean(rets), pct = prof / runs * 100;
    let verdict;
    if (pct >= 70 && avg > 0) verdict = `✅ Rentable en ${prof} de ${runs} mercados. Esto ya parece una ventaja real (aunque cuidado con el sobreajuste).`;
    else if (pct >= 50 && avg > 0) verdict = `Rentable en ${prof} de ${runs}. Hay algo de ventaja, pero con mucha variación. Revisa el drawdown.`;
    else verdict = `❌ Solo rentable en ${prof} de ${runs} mercados. Lo que funcionó en un backtest probablemente fue suerte.`;
    $('#botResults').innerHTML = `
      <div class="res-head">Robustez · 20 mercados · ${sv === 'mixed' ? 'escenarios mezclados' : SCENARIOS[sv === 'current' ? Sim.market.scenario : sv].name}</div>
      <div class="metrics sm">
        ${metric('Mercados rentables', `${prof}/${runs}`, pct >= 50 ? 'pos' : 'neg')}
        ${metric('Retorno medio', fmt.spct(avg), cls(avg))}
        ${metric('Mediana', fmt.spct(percentile(sorted, 0.5)), cls(percentile(sorted, 0.5)))}
        ${metric('Peor / mejor', `${sorted[0].toFixed(1)} / ${sorted[runs - 1].toFixed(1)}%`)}
        ${metric('Supera comprar y mantener', `${beat}/${runs}`)}
        ${metric('Drawdown medio', fmt.pct(mean(rows.map(r => r.dd)), 1), 'neg')}
        ${metric('Ops. por mercado', fmt.num(mean(rows.map(r => r.n)), 1))}
        ${metric('% acierto medio', fmt.pct(mean(rows.filter(r => r.n).map(r => r.wr)), 0))}
      </div>
      <div class="plot-title">Distribución del retorno por mercado</div>
      <div class="mini-chart"><canvas id="botHist"></canvas></div>
      <div class="verdict">${verdict}</div>`;
    const C = themeColors();
    plotHist($('#botHist'), rets, { bins: 12, colorFn: v => v >= 0 ? C.up : C.down, xFmt: v => v.toFixed(0) + '%', vlines: [{ x: 0, color: C.faint }] });
    Challenges.onRobust({ pct, avg, mixed: sv === 'mixed' });
  }
};

/* ---------------- Simulador ---------------- */
const Sim = {
  market: null, eng: null, chart: null, playing: false, timer: null, side: 1, botOn: false,
  challenge: null, startBar: 0, sideTab: 'manual', _closedManual: false,

  init() {
    fillScenarioSelect($('#simScenario'));
    $('#simScenario').value = Store.get('simScenario', 'aleatorio');
    this.chart = new CandleChart($('#simChart'), { sub: Store.get('simSub', 'rsi') });
    this.chart.ov = Object.assign({ sma20: true, sma50: true }, Store.get('overlays', {}));
    $$('[data-ov]').forEach(el => {
      el.checked = !!this.chart.ov[el.dataset.ov];
      el.onchange = () => { this.chart.ov[el.dataset.ov] = el.checked; Store.set('overlays', this.chart.ov); this.chart.render(); };
    });
    $('#simSub').value = this.chart.sub;
    $('#simSub').onchange = e => { this.chart.sub = e.target.value; Store.set('simSub', e.target.value); this.chart.render(); };

    $('#simNew').onclick = () => {
      if (this.challenge && !this.challenge.done && !confirm('¿Abandonar el reto en curso?')) return;
      this.challenge = null; Challenges.robust = null; Challenges.renderBanner(); this.newSession();
    };
    $('#simScenario').onchange = e => {
      Store.set('simScenario', e.target.value);
      if (this.challenge && !this.challenge.done) return toast('Termina o abandona el reto antes de cambiar el escenario.', 'warn');
      this.challenge = null; Challenges.renderBanner(); this.newSession();
    };
    $('#simPlay').onclick = () => this.togglePlay();
    $$('[data-step]').forEach(b => b.onclick = () => { this.stop(); this.advance(+b.dataset.step); });

    if (Store.get('hideWelcome', false)) $('#simWelcome').classList.add('hidden');
    $('#simWelcomeX').onclick = () => { $('#simWelcome').classList.add('hidden'); Store.set('hideWelcome', true); };

    $$('#sideTabs button').forEach(b => b.onclick = () => this.setSideTab(b.dataset.st));
    $$('#ordSide button').forEach(b => b.onclick = () => this.setSide(+b.dataset.side));
    ['#ordSizeVal', '#ordSlVal', '#ordTpVal'].forEach(id => $(id).addEventListener('input', () => this.refreshLight()));
    $('#ordTrail').onchange = () => this.refreshLight();
    $('#ordSizeMode').onchange = e => { $('#ordSizeVal').value = { risk: 1, usd: 1000, pct: 10 }[e.target.value]; this.refreshLight(); };
    $('#ordSlMode').onchange = () => this.setDefaultLevel('sl');
    $('#ordTpMode').onchange = () => this.setDefaultLevel('tp');
    $('#ordSubmit').onclick = () => this.submitOrder();
    $('#posCard').addEventListener('click', e => {
      const b = e.target.closest('[data-pa]'); if (!b) return;
      if (b.dataset.pa === 'close') this.closeManual(); else this.moveToBE();
    });

    document.addEventListener('keydown', e => {
      if (App.tab !== 'sim' || e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.stop(); this.advance(1); }
      else if (k === 'b') { this.setSide(1); this.submitOrder(); }
      else if (k === 'v') { this.setSide(-1); this.submitOrder(); }
      else if (k === 'c') this.closeManual();
    });
    this.newSession();
  },

  get candles() { return this.market.candles; },
  last() { return this.market.candles[this.market.candles.length - 1]; },

  newSession(scenario = $('#simScenario').value, seed = randomSeed()) {
    this.stop();
    if (this.botOn) this.toggleBot(true);
    this.market = new Market(scenario, seed);
    this.market.generate(150);
    this.startBar = this.market.candles.length;
    this.eng = new Engine(Settings.capital, Settings.fee, Settings.maxLev);
    this.eng.onOpen = p => this.onOpen(p);
    this.eng.onClose = t => this.onClose(t);
    this.chart.markers = []; this.chart.offset = 0;
    this.chart.setData(this.market.candles);
    $('#simScenario').value = scenario;
    this.refresh();
  },

  /* ----- avance del precio ----- */
  stepOnce() {
    if (this.challenge && this.challenge.done) return false;
    const c = this.market.next(), i = this.market.candles.length - 1;
    this._closedManual = false;
    this.eng.onCandle(c, i);
    if (this.botOn) botStep(this.eng, buildEvaluator(this.market.candles, Bot.rules), this.market.candles, i, Bot.cfgState);
    this.eng.mark(c.c);
    if (this.challenge) Challenges.tick();
    if (this._closedManual && this.playing && $('#simPauseOnClose').checked) this.stop();
    return !(this.challenge && this.challenge.done);
  },
  advance(n) {
    for (let k = 0; k < n; k++) if (!this.stepOnce()) break;
    this.refresh();
  },
  delay() { return [1100, 800, 560, 380, 250, 170, 110, 65, 30, 8][+$('#simSpeed').value - 1]; },
  togglePlay() { this.playing ? this.stop() : this.play(); },
  play() {
    if (this.challenge && this.challenge.done) return;
    this.playing = true; this.updatePlayBtn();
    const tick = () => {
      if (!this.playing) return;
      const ok = this.stepOnce(); this.refresh();
      if (!ok) { this.stop(); return; }
      if (this.playing) this.timer = setTimeout(tick, this.delay());
    };
    this.timer = setTimeout(tick, 0);
  },
  stop() { this.playing = false; clearTimeout(this.timer); this.updatePlayBtn(); },
  updatePlayBtn() { const b = $('#simPlay'); if (b) b.textContent = this.playing ? '⏸ Pausa' : '▶ Reproducir'; },

  /* ----- eventos del motor ----- */
  onOpen(p) {
    this.chart.markers.push({ i: p.bar, price: p.entry, type: p.side > 0 ? 'buy' : 'sell' });
  },
  onClose(t) {
    this.chart.markers.push({ i: t.closeBar, price: t.exit, type: 'exit', win: t.pnl > 0, from: { i: t.openBar, price: t.entry } });
    Object.assign(t, { date: Date.now(), scenario: this.market.scenario, tag: this.challenge ? this.challenge.d.id : null });
    Journal.add(t);
    if (t.source === 'manual') { this._closedManual = true; this.feedback(t); }
  },
  feedback(t) {
    const win = t.pnl > 0;
    let msg = `${win ? '✅ Ganancia' : '❌ Pérdida'} <b>${fmt.smoney(t.pnl)}</b>${isNum(t.R) ? ` (${fmt.r(t.R)})` : ''} · ${t.reason}`;
    const tips = [];
    if (t.sl == null) tips.push('Operaste sin stop loss: una sola mala operación puede borrar muchas buenas.');
    if (isNum(t.riskPct) && t.riskPct > 2.5) tips.push(`Arriesgaste ${t.riskPct.toFixed(1)}% del capital. Lo habitual es 0.5–2% por operación.`);
    if (isNum(t.rr) && t.rr < 1) tips.push(`Con R:R de ${t.rr.toFixed(2)} necesitas acertar más del ${(100 / (1 + t.rr)).toFixed(0)}% de las veces para ser rentable.`);
    if (win && t.reason === 'Cierre manual' && isNum(t.R) && t.R < 0.5 && t.tp != null) tips.push('Cerraste la ganancia muy pronto: dejar correr las ganancias hasta el objetivo es lo que paga las pérdidas.');
    if (!win && t.reason.startsWith('Stop') && t.sl != null) tips.push('El stop hizo su trabajo: pérdida controlada. Eso es buena gestión de riesgo.');
    toast(msg + (tips.length ? `<div class="tip-line">💡 ${tips[0]}</div>` : ''), win ? 'good' : 'bad', 5500);
  },

  /* ----- orden manual ----- */
  setSideTab(t) {
    this.sideTab = t;
    $$('#sideTabs button').forEach(b => b.classList.toggle('active', b.dataset.st === t));
    $('#st-manual').classList.toggle('hidden', t !== 'manual');
    $('#st-bot').classList.toggle('hidden', t !== 'bot');
    this.refreshLight();
  },
  setSide(s) {
    this.side = s;
    $$('#ordSide button').forEach(b => b.classList.toggle('active', +b.dataset.side === s));
    for (const k of ['sl', 'tp']) if ($(k === 'sl' ? '#ordSlMode' : '#ordTpMode').value === 'price') this.setDefaultLevel(k, true);
    this.refreshLight();
  },
  setDefaultLevel(k, quiet) {
    const mode = $(k === 'sl' ? '#ordSlMode' : '#ordTpMode').value, inp = $(k === 'sl' ? '#ordSlVal' : '#ordTpVal');
    this.chart.computeInd();
    const last = this.last().c, atr = this.chart.ind.atr[this.candles.length - 1] || last * 0.01;
    inp.disabled = mode === 'none';
    const defs = k === 'sl'
      ? { atr: 1.5, pct: 2, price: (last - this.side * atr * 1.5).toFixed(2), none: '' }
      : { rr: 2, atr: 3, pct: 4, price: (last + this.side * atr * 3).toFixed(2), none: '' };
    inp.value = defs[mode];
    inp.step = mode === 'price' ? '0.01' : '0.1';
    if (!quiet) this.refreshLight();
  },
  computeOrder(side) {
    const n = this.candles.length, price = this.last().c;
    this.chart.computeInd();
    const atr = this.chart.ind.atr[n - 1] || price * 0.01;
    const eq = this.eng.equity(price);
    const slMode = $('#ordSlMode').value, tpMode = $('#ordTpMode').value, sizeMode = $('#ordSizeMode').value;
    const slV = parseFloat($('#ordSlVal').value), tpV = parseFloat($('#ordTpVal').value), szV = parseFloat($('#ordSizeVal').value);
    const o = { side, price, atr, eq, err: null, sl: null, tp: null, slDist: null, tpDist: null };
    const bad = m => { o.err = m; return o; };
    if (slMode !== 'none') {
      if (!isNum(slV) || slV <= 0) return bad('Indica un valor válido para el stop loss.');
      if (slMode === 'atr') o.slDist = atr * slV;
      else if (slMode === 'pct') o.slDist = price * slV / 100;
      else {
        if (side > 0 && slV >= price) return bad('En un LARGO el stop debe estar por debajo del precio actual.');
        if (side < 0 && slV <= price) return bad('En un CORTO el stop debe estar por encima del precio actual.');
        o.slDist = Math.abs(price - slV);
      }
      o.sl = price - side * o.slDist;
      if (o.sl <= 0) return bad('El stop queda en un precio negativo. Redúcelo.');
    }
    if (tpMode !== 'none') {
      if (!isNum(tpV) || tpV <= 0) return bad('Indica un valor válido para el take profit.');
      if (tpMode === 'rr') { if (!o.slDist) return bad('Para fijar el objetivo por R:R necesitas un stop loss.'); o.tpDist = o.slDist * tpV; }
      else if (tpMode === 'atr') o.tpDist = atr * tpV;
      else if (tpMode === 'pct') o.tpDist = price * tpV / 100;
      else {
        if (side > 0 && tpV <= price) return bad('En un LARGO el objetivo debe estar por encima del precio actual.');
        if (side < 0 && tpV >= price) return bad('En un CORTO el objetivo debe estar por debajo del precio actual.');
        o.tpDist = Math.abs(tpV - price);
      }
      o.tp = price + side * o.tpDist;
      if (o.tp <= 0) return bad('El objetivo queda en un precio negativo.');
    }
    if (!isNum(szV) || szV <= 0) return bad('Indica un tamaño válido.');
    if (sizeMode === 'risk') { if (!o.slDist) return bad('Para dimensionar por riesgo % necesitas un stop loss (si no, el riesgo es infinito).'); o.qty = eq * szV / 100 / o.slDist; }
    else if (sizeMode === 'usd') o.qty = szV / price;
    else o.qty = eq * szV / 100 / price;
    const maxQty = eq * Settings.maxLev / price;
    o.capped = o.qty > maxQty; if (o.capped) o.qty = maxQty;
    o.notional = o.qty * price; o.lev = o.notional / eq;
    o.riskUsd = o.slDist ? o.qty * o.slDist : null;
    o.riskPct = o.riskUsd != null ? o.riskUsd / eq * 100 : null;
    o.reward = o.tpDist ? o.qty * o.tpDist : null;
    o.rr = o.tpDist && o.slDist ? o.tpDist / o.slDist : null;
    o.trail = $('#ordTrail').checked && !!o.slDist;
    return o;
  },
  submitOrder() {
    if (this.challenge && this.challenge.done) return toast('El reto terminó. Reinténtalo o crea un nuevo mercado.', 'warn');
    if (this.eng.pos) return toast('Ya tienes una posición abierta. Ciérrala antes de abrir otra.', 'warn');
    const o = this.computeOrder(this.side);
    if (o.err) return toast(o.err, 'warn');
    if (this.challenge) { const e = Challenges.validateOrder(o); if (e) return toast('🏁 Regla del reto: ' + e, 'warn', 5000); }
    this.eng.open({
      side: o.side, price: o.price, qty: o.qty, sl: o.sl, tp: o.tp, trail: o.trail ? o.slDist : null,
      bar: this.candles.length - 1, source: 'manual', riskUsd: o.riskUsd || 0, riskPct: o.riskPct, rr: o.rr, eqBefore: o.eq
    });
    this.refresh();
  },
  closeManual() {
    if (!this.eng.pos) return;
    this.eng.close(this.last().c, this.candles.length - 1, 'Cierre manual');
    this.refresh();
  },
  moveToBE() {
    const p = this.eng.pos, px = this.last().c; if (!p) return;
    if ((p.side > 0 && px <= p.entry) || (p.side < 0 && px >= p.entry)) return toast('El precio debe ir a tu favor para mover el stop al punto de entrada.', 'warn');
    p.sl = p.entry; toast('Stop movido a breakeven: esta operación ya no puede perder (salvo huecos).', 'good');
    this.refresh();
  },
  toggleBot(forceOff) {
    if (forceOff === true) this.botOn = false;
    else {
      Bot.readCfg();
      if (!this.botOn) {
        if (!Bot.hasEntry()) return toast('Añade al menos una condición de entrada.', 'warn');
        if (this.challenge) { const e = Challenges.validateBot(Bot.cfgState); if (e) return toast('🏁 Regla del reto: ' + e, 'warn', 5000); }
      }
      this.botOn = !this.botOn;
      if (this.botOn) toast('🤖 Bot activado: operará al cierre de cada vela. Pulsa ▶ Reproducir o avanza velas.', 'info', 5000);
    }
    const b = $('#botToggle');
    b.textContent = this.botOn ? '⏹ Desactivar bot' : '🤖 Activar bot en el gráfico';
    b.classList.toggle('danger', this.botOn); b.classList.toggle('primary', !this.botOn);
    if (forceOff !== true) this.refresh();
  },

  /* ----- render ----- */
  refreshLight() { this.updatePreview(); this.chart.render(); },
  refresh() {
    const last = this.last(), eq = this.eng.equity(last.c), cap0 = this.eng.cap0, st = tradeStats(this.eng.trades, cap0);
    $('#acct').innerHTML = `
      <div class="acct-main">
        <div><div class="k">Capital</div><div class="big">${fmt.money(eq)}</div></div>
        <div class="right"><div class="k">Resultado</div><div class="${cls(eq - cap0)}">${fmt.smoney(eq - cap0)}<br>${fmt.spct((eq / cap0 - 1) * 100)}</div></div>
      </div>
      <div class="acct-row"><span>Efectivo (realizado)</span><b>${fmt.money(this.eng.cash)}</b></div>
      <div class="acct-row"><span>Máx. drawdown <i class="tip" data-tip="La mayor caída desde un máximo de tu capital. Mide el dolor que soportas.">?</i></span><b class="${this.eng.maxDD > 1e-4 ? 'neg' : ''}">${fmt.pct(this.eng.maxDD * 100)}</b></div>
      <div class="acct-row"><span>Operaciones</span><b>${st.n}${st.n ? ` · ${fmt.pct(st.wr, 0)} acierto` : ''}</b></div>`;
    this.renderPos(last);
    this.updatePreview();
    this.renderTrades(st);
    $('#simBarInfo').textContent = `Vela ${this.candles.length - this.startBar} · ${SCENARIOS[this.market.scenario].name}${this.botOn ? ' · 🤖 bot activo' : ''}`;
    if (this.challenge) Challenges.renderBanner();
    this.chart.render();
  },
  renderPos(last) {
    const p = this.eng.pos, el = $('#posCard');
    if (!p) { el.innerHTML = '<div class="pos-empty">Sin posición abierta</div>'; return; }
    const upnl = p.side * (last.c - p.entry) * p.qty, r = p.riskUsd > 0 ? upnl / p.riskUsd : null;
    el.innerHTML = `<div class="pos-card ${p.side > 0 ? 'long' : 'short'}">
      <div class="pos-top">
        <span class="badge ${p.side > 0 ? 'long' : 'short'}">${p.side > 0 ? 'LARGO' : 'CORTO'}</span>
        <span class="muted small">${p.source === 'bot' ? '🤖 bot' : 'manual'} · ${this.candles.length - 1 - p.bar} velas</span>
        <span class="grow"></span>
        <b class="${cls(upnl)}">${fmt.smoney(upnl)}</b>${r !== null ? `<span class="small ${cls(upnl)}">${fmt.r(r)}</span>` : ''}
      </div>
      <div class="pos-grid">
        <div><span>Entrada</span><b>${p.entry.toFixed(2)}</b></div>
        <div><span>Actual</span><b>${last.c.toFixed(2)}</b></div>
        <div><span>Cantidad</span><b>${fmt.qty(p.qty)}</b></div>
        <div><span>${p.trail ? 'Trailing stop' : 'Stop loss'}</span><b class="neg">${p.sl != null ? p.sl.toFixed(2) : '—'}</b></div>
        <div><span>Objetivo</span><b class="pos">${p.tp != null ? p.tp.toFixed(2) : '—'}</b></div>
        <div><span>Valor</span><b>${fmt.money(p.qty * last.c, 0)}</b></div>
      </div>
      <div class="row2"><button class="btn" data-pa="close">Cerrar ahora</button><button class="btn" data-pa="be">Stop a breakeven</button></div>
    </div>`;
  },
  updatePreview() {
    const C = themeColors(), p = this.eng.pos, el = $('#ordPreview'), btn = $('#ordSubmit');
    const o = this.computeOrder(this.side);
    const lines = [];
    if (p) {
      lines.push({ price: p.entry, color: C.accent, label: 'Entrada', dash: [2, 3] });
      if (p.sl != null) lines.push({ price: p.sl, color: C.down, label: p.trail ? 'Trailing stop' : 'Stop loss' });
      if (p.tp != null) lines.push({ price: p.tp, color: C.up, label: 'Take profit' });
    } else if (!o.err && this.sideTab === 'manual') {
      if (o.sl != null) lines.push({ price: o.sl, color: C.down, label: 'Stop planeado', alpha: 0.6 });
      if (o.tp != null) lines.push({ price: o.tp, color: C.up, label: 'Objetivo planeado', alpha: 0.6 });
    }
    this.chart.lines = lines;

    btn.className = 'btn big ' + (this.side > 0 ? 'long' : 'short');
    btn.textContent = p ? 'Ya tienes una posición abierta' : this.side > 0 ? '▲ Abrir LARGO' : '▼ Abrir CORTO';
    btn.disabled = !!p || !!o.err;
    if (o.err) { el.innerHTML = `<div class="err">⚠ ${o.err}</div>`; return; }

    const pc = v => fmt.spct((v / o.price - 1) * 100, 2);
    const warns = [];
    if (o.sl == null) warns.push(['bad', '🚨 Sin stop loss: tu pérdida posible no tiene límite.']);
    if (o.riskPct != null && o.riskPct > 2) warns.push([o.riskPct > 5 ? 'bad' : '', `⚠ Riesgo alto: ${o.riskPct.toFixed(1)}% del capital (recomendado ≤ 2%).`]);
    if (o.rr != null && o.rr < 1) warns.push(['', '⚠ Ganas menos de lo que arriesgas (R:R < 1).']);
    if (o.slDist && o.slDist < 0.6 * o.atr) warns.push(['', '⚠ Stop muy ajustado (< 0.6 ATR): el ruido normal del precio puede sacarte.']);
    if (o.lev > 3) warns.push(['', `⚠ Apalancamiento alto: ${o.lev.toFixed(1)}×.`]);
    if (o.capped) warns.push(['', `Tamaño limitado por el apalancamiento máximo (${Settings.maxLev}×).`]);
    if (!warns.length && o.rr >= 1.5 && o.riskPct <= 2) warns.push(['good', '✔ Plan sólido: riesgo controlado y R:R favorable.']);
    const be = o.rr ? 100 / (1 + o.rr) : null;
    el.innerHTML = `
      <div class="pv-row"><span>Entrada (a mercado)</span><b>${o.price.toFixed(2)}</b></div>
      <div class="pv-row"><span>Stop loss</span><b class="neg">${o.sl != null ? `${o.sl.toFixed(2)} (${pc(o.sl)})` : '—'}</b></div>
      <div class="pv-row"><span>Take profit</span><b class="pos">${o.tp != null ? `${o.tp.toFixed(2)} (${pc(o.tp)})` : '—'}</b></div>
      <div class="pv-row"><span>Cantidad</span><b>${fmt.qty(o.qty)} uds · ${fmt.money(o.notional, 0)} (${o.lev.toFixed(2)}×)</b></div>
      <div class="pv-row"><span>Pérdida si salta el stop</span><b class="neg">${o.riskUsd != null ? `-${fmt.money(o.riskUsd)} (${o.riskPct.toFixed(2)}%)` : 'ilimitada'}</b></div>
      <div class="pv-row"><span>Ganancia si llega al objetivo</span><b class="pos">${o.reward != null ? '+' + fmt.money(o.reward) : '—'}</b></div>
      <div class="pv-row"><span>Ratio riesgo : beneficio <i class="tip" data-tip="Cuánto ganas por cada $1 que arriesgas. Con R:R 1:2, aunque aciertes solo el 40% de las veces sigues ganando dinero.">?</i></span><b>${o.rr ? '1 : ' + o.rr.toFixed(2) : '—'}</b></div>
      ${be != null ? `<div class="pv-row"><span>Acierto mínimo para no perder</span><b>${be.toFixed(0)}%</b></div><div class="pv-bar"><div style="width:${be}%"></div></div>` : ''}
      <div class="warns">${warns.map(([c, t]) => `<div class="${c}">${t}</div>`).join('')}</div>`;
  },
  renderTrades(st) {
    const T = this.eng.trades;
    $('#simSessStats').textContent = T.length ? `${st.n} ops · ${fmt.pct(st.wr, 0)} acierto · PF ${fmt.pf(st.pf)} · ${fmt.smoney(st.pnl)}` : '';
    if (!T.length) { $('#simTrades').innerHTML = '<tr><td class="empty">Aún no hay operaciones. Abre una posición (o activa el bot) y avanza el precio.</td></tr>'; return; }
    $('#simTrades').innerHTML = `<tr><th>#</th><th>Tipo</th><th>Origen</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Resultado</th><th class="num">R</th><th class="num">Velas</th><th>Motivo</th></tr>` +
      T.map((t, k) => `<tr>
        <td>${k + 1}</td>
        <td><span class="badge ${t.side > 0 ? 'long' : 'short'}">${t.side > 0 ? 'LARGO' : 'CORTO'}</span></td>
        <td>${t.source === 'bot' ? '<span class="badge bot">BOT</span>' : '<span class="badge n">manual</span>'}</td>
        <td class="num">${t.entry.toFixed(2)}</td><td class="num">${t.exit.toFixed(2)}</td>
        <td class="num ${cls(t.pnl)}">${fmt.smoney(t.pnl)}</td>
        <td class="num ${cls(t.pnl)}">${fmt.r(t.R)}</td>
        <td class="num">${t.bars}</td><td class="muted">${t.reason}</td></tr>`).reverse().join('');
  },
  onShow() { this.chart.render(); }
};
