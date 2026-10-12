'use strict';
/* =========================================================
   Modo predicción: ¿sube o baja?
   ========================================================= */

const Predict = {
  m: null, chart: null, busy: false,
  stats: Store.get('predict', { n: 0, hits: 0, streak: 0, best: 0, hist: [] }),

  init() {
    fillScenarioSelect($('#predScen'));
    this.chart = new CandleChart($('#predChart'), { sub: 'rsi', view: 90, rightPad: 22 });
    this.chart.ov = { sma20: true, sma50: true };
    $('#predScen').onchange = () => this.newMarket();
    $('#predNew').onclick = () => this.newMarket();
    $('#predUp').onclick = () => this.guess(1);
    $('#predDown').onclick = () => this.guess(-1);
    $('#predReset').onclick = () => {
      if (!confirm('¿Reiniciar tu marcador de predicciones?')) return;
      this.stats = { n: 0, hits: 0, streak: 0, best: 0, hist: [] }; this.save(); this.renderStats();
    };
    document.addEventListener('keydown', e => {
      if (App.tab !== 'predict' || e.target.matches('input, select, textarea')) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); this.guess(1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.guess(-1); }
    });
    this.newMarket(); this.renderStats();
  },
  save() { Store.set('predict', this.stats); },
  newMarket() {
    if (this.busy) return;
    this.m = new Market($('#predScen').value, randomSeed());
    this.m.generate(120);
    this.chart.markers = []; this.chart.zone = null; this.chart.offset = 0;
    this.chart.setData(this.m.candles);
    $('#predMsg').innerHTML = '<span class="muted">Observa el gráfico y decide: dentro de N velas, ¿el precio estará <b>más arriba</b> o <b>más abajo</b> que ahora? (Teclas ↑ / ↓)</span>';
  },
  guess(dir) {
    if (this.busy) return;
    if (this.m.candles.length > 700) this.newMarket();
    this.busy = true; $('#predUp').disabled = $('#predDown').disabled = true;
    const H = +$('#predH').value, cs = this.m.candles, i0 = cs.length - 1, p0 = cs[i0].c;
    this.chart.zone = { from: i0 + 1, to: i0 + H }; this.chart.offset = 0;
    this.chart.markers.push({ i: i0, price: p0, type: dir > 0 ? 'buy' : 'sell' });
    $('#predMsg').innerHTML = `<span class="muted">Predijiste que <b>${dir > 0 ? 'subirá' : 'bajará'}</b>… avanzando ${H} vela(s)</span>`;
    let k = 0;
    const step = () => {
      this.m.next(); this.chart.render();
      if (++k < H) setTimeout(step, H > 5 ? 80 : 170);
      else setTimeout(() => this.resolve(dir, i0, p0, H), 120);
    };
    setTimeout(step, 150);
  },
  resolve(dir, i0, p0, H) {
    const cs = this.m.candles, L = cs.length - 1, p1 = cs[L].c, move = (p1 / p0 - 1) * 100;
    const hit = Math.sign(p1 - p0) === dir, s = this.stats;
    s.n++;
    if (hit) { s.hits++; s.streak = s.streak > 0 ? s.streak + 1 : 1; } else s.streak = s.streak < 0 ? s.streak - 1 : -1;
    s.best = Math.max(s.best, s.streak);
    s.hist.unshift({ dir, hit, move, H, scen: this.m.scenario });
    s.hist = s.hist.slice(0, 12);
    this.save();
    this.chart.markers.push({ i: L, price: p1, type: 'exit', win: hit, from: { i: i0, price: p0 } });
    this.chart.render();
    $('#predMsg').innerHTML = `${hit ? '✅ <b class="pos">¡Correcto!</b>' : '❌ <b class="neg">Fallaste.</b>'} El precio ${move >= 0 ? 'subió' : 'bajó'} <b>${Math.abs(move).toFixed(2)}%</b> en ${H} vela(s). ${this.hint(i0)}`;
    this.busy = false; $('#predUp').disabled = $('#predDown').disabled = false;
    this.renderStats();
  },
  // Pequeña pista educativa sobre lo que decían los indicadores en el momento de predecir
  hint(i) {
    const C = this.m.candles.map(c => c.c), rsi = Ind.rsi(C, 14)[i], s20 = Ind.sma(C, 20)[i], s50 = Ind.sma(C, 50)[i];
    const bits = [];
    if (isNum(s20) && isNum(s50)) bits.push(s20 > s50 ? 'SMA20 > SMA50 (tendencia alcista)' : 'SMA20 < SMA50 (tendencia bajista)');
    if (isNum(rsi)) bits.push(`RSI ${rsi.toFixed(0)}${rsi > 70 ? ' (sobrecompra)' : rsi < 30 ? ' (sobreventa)' : ''}`);
    return bits.length ? `<span class="muted small">En ese momento: ${bits.join(' · ')}.</span>` : '';
  },
  renderStats() {
    const s = this.stats, acc = s.n ? s.hits / s.n * 100 : NaN;
    const p = s.n ? binomTailGE(s.hits, s.n) : NaN;
    const band = s.n ? 1.96 * Math.sqrt(0.25 / s.n) * 100 : 0;
    let verdict;
    if (s.n < 20) verdict = `<div>Haz al menos <b>20 predicciones</b> para que la estadística empiece a decir algo (llevas ${s.n}).</div>`;
    else if (acc > 50 && p < 0.05) verdict = `<div class="good">🎯 Acertar ${s.hits} de ${s.n} por puro azar solo ocurre el <b>${(p * 100).toFixed(1)}%</b> de las veces. ¡Parece que tu lectura del gráfico aporta ventaja real!</div>`;
    else verdict = `<div class="warn">🪙 Acertar ${s.hits} o más de ${s.n} lanzando una moneda ocurre el <b>${(p * 100).toFixed(0)}%</b> de las veces. Por ahora tu resultado es indistinguible del azar.</div>`;
    $('#predStats').innerHTML = `
      <div class="metrics">
        ${metric('Predicciones', s.n)}
        ${metric('Aciertos', s.hits)}
        ${metric('% acierto', fmt.pct(acc, 1), acc > 50 ? 'pos' : acc < 50 ? 'neg' : '')}
        ${metric('Racha actual', s.streak > 0 ? `${s.streak} ✅` : s.streak < 0 ? `${-s.streak} ❌` : '—')}
        ${metric('Mejor racha', s.best || '—')}
      </div>
      ${s.n ? `<div class="acc-bar">
        <div class="band" style="left:${Math.max(0, 50 - band)}%;width:${Math.min(100, 2 * band)}%"></div>
        <div class="fill" style="width:${acc}%;opacity:.55"></div>
        <div class="mark" style="left:50%"></div>
        <div class="lab" style="left:50%">50% (azar)</div>
        <div class="lab" style="left:${clamp(acc, 8, 92)}%;top:-18px;color:var(--text)">${acc.toFixed(0)}%</div>
      </div>
      <p class="muted small">La franja naranja es el rango donde caería el 95% de las veces alguien que adivina al azar con ${s.n} intentos (50% ± ${band.toFixed(1)}%).</p>` : ''}
      <div class="insights">${verdict}</div>
      <div class="plot-title">Últimas predicciones</div>
      <div class="hist-list">${s.hist.map(h => `<div><span>${h.hit ? '✅' : '❌'} ${h.dir > 0 ? '⬆ Subirá' : '⬇ Bajará'} · ${h.H} vela(s)</span><span class="${cls(h.move)}">${fmt.spct(h.move)}</span></div>`).join('') || '<div class="muted">Aún no hay predicciones.</div>'}</div>`;
  },
  onShow() { this.chart.render(); }
};
