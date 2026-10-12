'use strict';
/* =========================================================
   Diario de operaciones y estadísticas
   ========================================================= */

const Journal = {
  trades: Store.get('journal', []),
  add(t) {
    const keep = ['date', 'source', 'tag', 'scenario', 'side', 'entry', 'exit', 'qty', 'pnl', 'R', 'bars', 'reason', 'riskPct', 'rr', 'pnlPct', 'sl'];
    const o = {}; for (const k of keep) o[k] = t[k] ?? null;
    this.trades.push(o);
    if (this.trades.length > 3000) this.trades.splice(0, this.trades.length - 3000);
    Store.set('journal', this.trades);
    if (window.App && App.tab === 'stats') Stats.render();
  },
  clear() { this.trades = []; Store.set('journal', []); }
};

const Stats = {
  init() {
    $('#stFilter').onchange = () => this.render();
    $('#stClear').onclick = () => { if (confirm('¿Borrar todo el historial de operaciones? No se puede deshacer.')) { Journal.clear(); this.render(); } };
    $('#stExport').onclick = () => this.exportCsv();
  },
  filtered() {
    const f = $('#stFilter').value, T = Journal.trades;
    if (f === 'manual') return T.filter(t => t.source === 'manual' && !t.tag);
    if (f === 'bot') return T.filter(t => t.source === 'bot');
    if (f === 'reto') return T.filter(t => t.tag);
    return T;
  },
  render() {
    const T = this.filtered(), cap = Settings.capital, st = tradeStats(T, cap), C = themeColors();
    $('#stMetrics').innerHTML = `
      ${metric('Operaciones', st.n)}
      ${metric('% acierto', fmt.pct(st.wr, 1), st.wr >= 50 ? 'pos' : '')}
      ${metric('Resultado total', fmt.smoney(st.pnl, 0), cls(st.pnl))}
      ${metric('Profit factor <i class="tip" data-tip="Ganancias brutas / pérdidas brutas. Mayor que 1 = rentable; mayor que 1.5 = muy bueno.">?</i>', fmt.pf(st.pf), st.pf >= 1 ? 'pos' : 'neg')}
      ${metric('Expectativa / op.', fmt.smoney(st.exp), cls(st.exp))}
      ${metric('R medio <i class="tip" data-tip="Resultado medio medido en unidades de riesgo. +0.3R significa que ganas en promedio el 30% de lo que arriesgas por operación.">?</i>', fmt.r(st.avgR), cls(st.avgR))}
      ${metric('Ganancia media', fmt.money(st.avgW), 'pos')}
      ${metric('Pérdida media', fmt.money(st.avgL), 'neg')}
      ${metric('Máx. drawdown', fmt.pct(st.maxDD, 1), 'neg', `sobre ${fmt.money(cap, 0)}`)}
      ${metric('Mejor / peor', `${fmt.money(st.best, 0)} / ${fmt.money(st.worst, 0)}`)}
      ${metric('Duración media', isNum(st.avgBars) ? st.avgBars.toFixed(1) + ' velas' : '—')}`;

    if (T.length) {
      plotXY($('#stCurve'), {
        padL: 66, series: [{ ys: st.curve, color: C.accent, width: 2 }],
        hlines: [{ y: cap, color: C.faint, include: true }],
        yFmt: v => '$' + (v / 1000).toFixed(1) + 'k', xFmt: v => Math.round(v)
      });
      const Rs = T.filter(t => isNum(t.R)).map(t => clamp(t.R, -5, 10));
      if (Rs.length) plotHist($('#stHist'), Rs, { bins: 24, colorFn: v => v > 0 ? C.up : C.down, xFmt: v => v.toFixed(1) + 'R', vlines: [{ x: 0, color: C.faint }] });
      else prepCanvas($('#stHist'));
    } else { prepCanvas($('#stCurve')); prepCanvas($('#stHist')); }

    // Diagnóstico
    const ins = [];
    if (!T.length) ins.push(['', 'Aún no hay operaciones. Ve al <b>Simulador</b>, abre una posición y avanza el precio.']);
    else {
      if (st.n < 30) ins.push(['warn', `Llevas ${st.n} operaciones. Con menos de 30 la suerte pesa demasiado: sigue practicando antes de sacar conclusiones.`]);
      if (isNum(st.pf)) {
        if (st.pf < 1) ins.push(['bad', `Profit factor ${fmt.pf(st.pf)}: tus pérdidas superan a tus ganancias.`]);
        else if (st.pf >= 1.5) ins.push(['good', `Profit factor ${fmt.pf(st.pf)}: excelente relación entre lo que ganas y lo que pierdes.`]);
      }
      if (st.wr >= 55 && Math.abs(st.avgL) > st.avgW * 1.3) ins.push(['warn', 'Aciertas a menudo pero tus pérdidas son mucho mayores que tus ganancias: probablemente cierras las ganadoras pronto y aguantas las perdedoras.']);
      if (st.wr < 45 && st.avgW > Math.abs(st.avgL) * 1.8 && st.pnl > 0) ins.push(['good', 'Ganas menos de la mitad de las veces pero tus ganancias son mucho mayores que tus pérdidas: así funcionan las estrategias de tendencia.']);
      const noSl = T.filter(t => t.sl == null).length;
      if (noSl) ins.push(['bad', `${noSl} operación(es) sin stop loss (${(noSl / T.length * 100).toFixed(0)}%). Ponerlo siempre es la regla nº 1.`]);
      const risky = T.filter(t => isNum(t.riskPct) && t.riskPct > 2).length;
      if (risky) ins.push(['warn', `${risky} operación(es) arriesgaron más del 2% del capital.`]);
      const lowRR = T.filter(t => isNum(t.rr) && t.rr < 1).length;
      if (lowRR > T.length * 0.3) ins.push(['warn', `El ${(lowRR / T.length * 100).toFixed(0)}% de tus operaciones tenían R:R menor a 1.`]);
      const longs = T.filter(t => t.side > 0), shorts = T.filter(t => t.side < 0);
      if (longs.length >= 5 && shorts.length >= 5) {
        const pl = sum(longs.map(t => t.pnl)), ps = sum(shorts.map(t => t.pnl));
        ins.push(['', `Largos: ${fmt.smoney(pl, 0)} en ${longs.length} ops · Cortos: ${fmt.smoney(ps, 0)} en ${shorts.length} ops.`]);
      }
    }
    $('#stInsights').innerHTML = ins.map(([c, t]) => `<div class="${c}">${t}</div>`).join('');

    // Por escenario
    const by = {};
    for (const t of T) (by[t.scenario] = by[t.scenario] || []).push(t);
    const rows = Object.entries(by).map(([k, arr]) => { const s = tradeStats(arr, cap); return [k, s]; }).sort((a, b) => b[1].pnl - a[1].pnl);
    $('#stByScen').innerHTML = rows.length
      ? '<tr><th>Escenario</th><th class="num">Ops</th><th class="num">% acierto</th><th class="num">PF</th><th class="num">Resultado</th></tr>' +
        rows.map(([k, s]) => `<tr><td>${SCENARIOS[k] ? SCENARIOS[k].name : k}</td><td class="num">${s.n}</td><td class="num">${fmt.pct(s.wr, 0)}</td><td class="num">${fmt.pf(s.pf)}</td><td class="num ${cls(s.pnl)}">${fmt.smoney(s.pnl, 0)}</td></tr>`).join('')
      : '<tr><td class="empty">Sin datos.</td></tr>';

    // Diario
    $('#stTable').innerHTML = T.length
      ? '<tr><th>Fecha</th><th>Origen</th><th>Escenario</th><th>Tipo</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Resultado</th><th class="num">R</th><th class="num">Riesgo</th><th>Motivo</th></tr>' +
        T.slice(-300).reverse().map(t => `<tr>
          <td class="muted">${new Date(t.date).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td>${t.tag ? '<span class="badge n">reto</span>' : t.source === 'bot' ? '<span class="badge bot">BOT</span>' : '<span class="badge n">manual</span>'}</td>
          <td class="muted">${SCENARIOS[t.scenario] ? SCENARIOS[t.scenario].name : '—'}</td>
          <td><span class="badge ${t.side > 0 ? 'long' : 'short'}">${t.side > 0 ? 'LARGO' : 'CORTO'}</span></td>
          <td class="num">${fmt.num(t.entry)}</td><td class="num">${fmt.num(t.exit)}</td>
          <td class="num ${cls(t.pnl)}">${fmt.smoney(t.pnl)}</td><td class="num ${cls(t.pnl)}">${fmt.r(t.R)}</td>
          <td class="num">${isNum(t.riskPct) ? t.riskPct.toFixed(2) + '%' : '<span class="neg">sin SL</span>'}</td>
          <td class="muted">${t.reason}</td></tr>`).join('')
      : '<tr><td class="empty">Tu diario está vacío.</td></tr>';
  },
  exportCsv() {
    const T = this.filtered();
    if (!T.length) return toast('No hay operaciones para exportar.', 'warn');
    const cols = ['date', 'source', 'tag', 'scenario', 'side', 'entry', 'exit', 'qty', 'pnl', 'R', 'bars', 'riskPct', 'rr', 'reason'];
    const csv = [cols.join(',')].concat(T.map(t => cols.map(c => {
      let v = t[c]; if (c === 'date') v = new Date(v).toISOString();
      if (v == null) return '';
      return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : (typeof v === 'number' ? +v.toFixed(6) : v);
    }).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'trading-lab-diario.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  onShow() { this.render(); }
};
