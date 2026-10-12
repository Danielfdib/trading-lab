'use strict';
/* =========================================================
   Probabilidad: expectativa, Kelly, Monte Carlo y rachas
   ========================================================= */

const MC = {
  _t: null,
  init() {
    const upd = () => {
      $('#mcWRv').textContent = $('#mcWR').value + '%';
      $('#mcRRv').textContent = '1 : ' + (+$('#mcRR').value).toFixed(1);
      $('#mcRiskv').textContent = (+$('#mcRisk').value).toFixed(2) + '%';
    };
    $$('#tab-mc input, #tab-mc select').forEach(el => el.addEventListener('input', () => { upd(); this.schedule(); }));
    $('#mcRun').onclick = () => this.run();
    $('#mcFromJournal').onclick = () => this.fromJournal();
    upd();
  },
  schedule() { clearTimeout(this._t); this._t = setTimeout(() => this.run(), 120); },
  read() {
    const n = (id, d, a, b) => { const v = parseFloat($(id).value); return isNum(v) ? clamp(v, a, b) : d; };
    return {
      W: n('#mcWR', 45, 1, 99) / 100, RR: n('#mcRR', 2, 0.1, 20), risk: n('#mcRisk', 1, 0.05, 100) / 100,
      N: Math.round(n('#mcTrades', 200, 10, 1000)), S: Math.round(n('#mcSims', 1000, 100, 5000)),
      ruin: n('#mcRuin', 50, 1, 99) / 100, comp: $('#mcMode').value === 'comp', vary: $('#mcVar').checked
    };
  },
  fromJournal() {
    const T = Journal.trades.filter(t => isNum(t.R));
    if (T.length < 5) return toast('Necesitas al menos 5 operaciones con stop loss en tu historial.', 'warn');
    const w = T.filter(t => t.R > 0), l = T.filter(t => t.R <= 0);
    const wr = w.length / T.length * 100;
    const avgW = w.length ? mean(w.map(t => t.R)) : 0, avgL = l.length ? Math.abs(mean(l.map(t => t.R))) : 1;
    const rr = avgL > 0 ? avgW / avgL : 2;
    $('#mcWR').value = Math.round(clamp(wr, 10, 90));
    $('#mcRR').value = clamp(rr, 0.3, 5).toFixed(1);
    $('#mcWR').dispatchEvent(new Event('input'));
    toast(`Cargado de ${T.length} operaciones: ${wr.toFixed(0)}% de acierto, R:R ${rr.toFixed(2)}.`, 'info');
    this.run();
  },
  run() {
    const p = this.read(), cap = Settings.capital, rng = new RNG(randomSeed());
    const { W, RR, risk, N, S, ruin, comp, vary } = p;
    const paths = new Float64Array(S * (N + 1)), finals = new Array(S), dds = new Array(S);
    let ruined = 0, streakSum = 0, profitable = 0;
    for (let s = 0; s < S; s++) {
      let eq = cap, peak = cap, mdd = 0, streak = 0, maxStreak = 0, dead = false;
      paths[s * (N + 1)] = eq;
      for (let t = 1; t <= N; t++) {
        if (eq > 0) {
          const win = rng.next() < W;
          const R = win ? RR * (vary ? rng.range(0.5, 1.5) : 1) : -(vary ? rng.range(0.8, 1.25) : 1);
          const bet = comp ? eq * risk : cap * risk;
          eq = Math.max(0, eq + bet * R);
          if (win) streak = 0; else { streak++; if (streak > maxStreak) maxStreak = streak; }
          if (eq > peak) peak = eq;
          const dd = (peak - eq) / peak; if (dd > mdd) mdd = dd;
          if (!dead && (eq <= 0 || (cap - eq) / cap >= ruin)) dead = true;
        }
        paths[s * (N + 1) + t] = eq;
      }
      finals[s] = eq; dds[s] = mdd * 100; streakSum += maxStreak;
      if (dead) ruined++;
      if (eq > cap) profitable++;
    }
    const fs = finals.slice().sort((a, b) => a - b);
    const expR = W * RR - (1 - W), beWR = 1 / (1 + RR), kelly = W - (1 - W) / RR;

    // Percentiles por paso (muestreados)
    const step = Math.max(1, Math.floor(N / 200)), xs = [], bands = { p5: [], p25: [], p50: [], p75: [], p95: [] }, col = new Float64Array(S);
    for (let t = 0; t <= N; t += step) {
      for (let s = 0; s < S; s++) col[s] = paths[s * (N + 1) + t];
      const srt = Array.from(col).sort((a, b) => a - b);
      xs.push(t);
      bands.p5.push(percentile(srt, 0.05)); bands.p25.push(percentile(srt, 0.25)); bands.p50.push(percentile(srt, 0.5));
      bands.p75.push(percentile(srt, 0.75)); bands.p95.push(percentile(srt, 0.95));
    }
    const C = themeColors(), samples = [];
    for (let k = 0; k < Math.min(25, S); k++) {
      const s = Math.floor(rng.next() * S), ys = [];
      for (const t of xs) ys.push(paths[s * (N + 1) + t]);
      samples.push({ xs, ys, color: finals[s] >= cap ? C.up : C.down, width: 1, alpha: 0.28 });
    }
    plotXY($('#mcFan'), {
      xMin: 0, xMax: N, padL: 64,
      bands: [{ xs, lo: bands.p5, hi: bands.p95, color: C.accent, alpha: 0.1 }, { xs, lo: bands.p25, hi: bands.p75, color: C.accent, alpha: 0.18 }],
      series: [...samples, { xs, ys: bands.p50, color: C.accent, width: 2.4 }],
      hlines: [{ y: cap, color: C.faint, label: 'capital inicial', include: true }, { y: cap * (1 - ruin), color: C.down, label: `ruina (−${(ruin * 100).toFixed(0)}%)`, alpha: 0.6, include: true }],
      yFmt: v => '$' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : v.toFixed(0)), xFmt: v => Math.round(v)
    });
    const p99 = percentile(fs, 0.99);
    plotHist($('#mcHist'), finals.map(v => Math.min(v, p99)), {
      bins: 40, colorFn: v => v >= cap ? C.up : C.down,
      xFmt: v => '$' + (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k', vlines: [{ x: cap, color: C.faint, label: 'inicio' }]
    });
    plotHist($('#mcDD'), dds, { bins: 30, colorFn: () => C.down, xFmt: v => v.toFixed(0) + '%', vlines: [{ x: ruin * 100, color: C.warn, label: 'ruina' }] });

    const med = percentile(fs, 0.5), pProf = profitable / S * 100, pRuin = ruined / S * 100, avgStreak = streakSum / S;
    $('#mcMetrics').innerHTML = `
      ${metric('Expectativa por operación', fmt.r(expR), cls(expR), `${fmt.smoney(expR * cap * risk, 0)} al inicio`)}
      ${metric('Prob. de terminar en ganancia', fmt.pct(pProf, 1), pProf >= 50 ? 'pos' : 'neg')}
      ${metric('Prob. de ruina', fmt.pct(pRuin, 1), pRuin > 5 ? 'neg' : pRuin > 0 ? 'warn' : 'pos', `caída ≥ ${(ruin * 100).toFixed(0)}%`)}
      ${metric('Capital final (mediana)', fmt.money(med, 0), cls(med - cap))}
      ${metric('Peor 5% / mejor 5%', `${fmt.money(percentile(fs, 0.05), 0)} / ${fmt.money(percentile(fs, 0.95), 0)}`)}
      ${metric('Drawdown máx. típico', fmt.pct(percentile(dds.slice().sort((a, b) => a - b), 0.5), 1), 'neg')}
      ${metric('Peor racha perdedora (media)', avgStreak.toFixed(1) + ' seguidas')}`;
    $('#mcFormula').innerHTML = `
      <div><span>Expectativa = W×R:R − (1−W)</span><b class="${cls(expR)}">${expR.toFixed(3)} R</b></div>
      <div><span>Acierto mínimo (breakeven) = 1/(1+R:R)</span><b>${(beWR * 100).toFixed(1)}%</b></div>
      <div><span>Kelly = W − (1−W)/R:R</span><b>${kelly > 0 ? (kelly * 100).toFixed(1) + '%' : 'no apostar'}</b></div>
      <div><span>Medio Kelly (más prudente)</span><b>${kelly > 0 ? (kelly * 50).toFixed(1) + '%' : '—'}</b></div>`;

    const ins = [];
    if (expR <= 0) ins.push(['bad', `📉 <b>Expectativa negativa (${expR.toFixed(2)}R).</b> Con ${(W * 100).toFixed(0)}% de acierto y R:R 1:${RR.toFixed(1)} pierdes dinero a largo plazo. Ninguna gestión de capital puede arreglarlo: necesitas acertar más del ${(beWR * 100).toFixed(0)}% o mejorar tu R:R.`]);
    else ins.push(['good', `📈 <b>Expectativa positiva:</b> cada operación aporta en promedio ${expR.toFixed(2)}R. Pero mira la dispersión: incluso así, el ${(100 - pProf).toFixed(0)}% de los futuros simulados terminan en pérdida tras ${N} operaciones.`]);
    if (kelly > 0 && risk > kelly) ins.push(['bad', `🔥 Arriesgas ${(risk * 100).toFixed(1)}%, más que el Kelly completo (${(kelly * 100).toFixed(1)}%). Por encima de Kelly asumes <b>más riesgo y obtienes MENOS crecimiento</b>. Por encima de 2× Kelly, el crecimiento esperado es negativo aunque la estrategia gane.`]);
    else if (kelly > 0 && risk > kelly / 2) ins.push(['warn', `⚠ Arriesgas entre medio Kelly y Kelly completo: crecimiento alto pero con drawdowns muy duros.`]);
    if (pRuin > 1) ins.push(['bad', `💀 En el ${pRuin.toFixed(1)}% de los casos pierdes al menos el ${(ruin * 100).toFixed(0)}% del capital. Reduce el riesgo por operación: es la palanca más poderosa contra la ruina.`]);
    ins.push(['', `🎲 Espera una racha de unas <b>${Math.round(avgStreak)} pérdidas seguidas</b> en ${N} operaciones. Si no estás preparado psicológicamente para eso, abandonarás una estrategia buena en el peor momento.`]);
    $('#mcInsight').innerHTML = ins.map(([c, t]) => `<div class="${c}">${t}</div>`).join('');

    // Rachas
    const q = 1 - W, ks = [3, 4, 5, 6, 7, 8, 10, 12, 15];
    $('#mcStreaks').innerHTML = ks.map(k => {
      const pr = streakProb(N, k, q) * 100;
      return `<div class="streak"><div class="k">≥ ${k} pérdidas seguidas</div><div class="v">${pr >= 99.95 ? '≈100' : pr.toFixed(pr < 1 ? 2 : 1)}%</div><div class="bar"><div style="width:${pr}%"></div></div></div>`;
    }).join('');
  },
  onShow() { this.run(); }
};
