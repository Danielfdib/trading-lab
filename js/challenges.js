'use strict';
/* =========================================================
   Retos: escenarios con objetivos y reglas
   ========================================================= */

const CHALLENGES = [
  { id: 'c1', icon: '🎯', title: 'Primeros pasos', level: 'Fácil', scenario: 'aleatorio', bars: 120,
    desc: 'Haz al menos 3 operaciones, todas con stop loss y arriesgando como máximo 2% cada una. Termina sin perder más del 3%.',
    rules: { requireSL: true, maxRiskPct: 2 }, goal: { minTrades: 3, minRet: -3 } },
  { id: 'c2', icon: '🏄', title: 'Surfea la tendencia', level: 'Fácil', scenario: 'alcista', bars: 150,
    desc: 'El mercado tiene sesgo alcista. Consigue +4% sin que tu drawdown supere el 5%. Pista: compra los retrocesos y deja correr las ganancias.',
    rules: { requireSL: true }, goal: { minRet: 4, maxDD: 5 } },
  { id: 'c3', icon: '🐻', title: 'Gana en la caída', level: 'Medio', scenario: 'bajista', bars: 150,
    desc: 'Mercado bajista: aprende a operar en corto. Consigue +3% con drawdown máximo de 5%.',
    rules: { requireSL: true }, goal: { minRet: 3, maxDD: 5 } },
  { id: 'c4', icon: '↔️', title: 'Rey del rango', level: 'Medio', scenario: 'lateral', bars: 150,
    desc: 'Sin tendencia: el precio oscila. Gana +2% con drawdown máximo de 3%. Pista: compra cerca de soporte / RSI bajo, vende cerca de resistencia / RSI alto.',
    rules: { requireSL: true }, goal: { minRet: 2, maxDD: 3, minTrades: 2 } },
  { id: 'c5', icon: '💥', title: 'Sobrevive al crash', level: 'Medio', scenario: 'crash', bars: 150,
    desc: 'En algún momento llegará una caída violenta. Opera (mín. 2 operaciones) arriesgando ≤ 1% y termina con al menos el 98% del capital.',
    rules: { requireSL: true, maxRiskPct: 1 }, goal: { minRet: -2, minTrades: 2 } },
  { id: 'c6', icon: '🌪️', title: 'Domar la volatilidad', level: 'Difícil', scenario: 'volatil', bars: 150,
    desc: 'Movimientos enormes y erráticos. Gana +3% con drawdown máximo de 8%. Pista: stops más amplios (ATR) y posiciones más pequeñas.',
    rules: { requireSL: true, maxRiskPct: 2 }, goal: { minRet: 3, maxDD: 8 } },
  { id: 'c7', icon: '🧘', title: 'Disciplina de hierro', level: 'Difícil', scenario: 'aleatorio', bars: 250,
    desc: 'Haz 8 o más operaciones arriesgando ≤ 1% y con un R:R de al menos 1:2 en cada una. Termina en positivo.',
    rules: { requireSL: true, maxRiskPct: 1, minRR: 2 }, goal: { minTrades: 8, minRet: 0.01 } },
  { id: 'c8', icon: '📰', title: 'Noticias inesperadas', level: 'Difícil', scenario: 'noticias', bars: 150,
    desc: 'Saltos bruscos por noticias pueden atravesar tu stop. Gana +2% con drawdown máximo de 6%.',
    rules: { requireSL: true }, goal: { minRet: 2, maxDD: 6 } },
  { id: 'c9', icon: '🤖', title: 'Bot autónomo', level: 'Experto', type: 'robust',
    desc: 'Diseña un bot de reglas que sea rentable en al menos 13 de 20 mercados de escenarios mezclados (≥ 65%) con retorno medio positivo.',
    goal: { robustPct: 65 } }
];

const Challenges = {
  progress: Store.get('challenges', {}), robust: null,
  init() {
    this.render();
    $('#chGrid').addEventListener('click', e => { const b = e.target.closest('[data-start]'); if (b) this.start(b.dataset.start); });
    $('#chBanner').addEventListener('click', e => {
      const b = e.target.closest('[data-cha]'); if (!b) return;
      const a = b.dataset.cha;
      if (a === 'quit') this.quit();
      else if (a === 'retry' && Sim.challenge) this.start(Sim.challenge.d.id);
      else if (a === 'list') { this.quit(); App.show('challenges'); }
    });
  },
  goalChips(d) {
    const r = d.rules || {}, g = d.goal || {}, out = [];
    if (r.requireSL) out.push('Stop loss obligatorio');
    if (r.maxRiskPct) out.push(`Riesgo ≤ ${r.maxRiskPct}% por op.`);
    if (r.minRR) out.push(`R:R ≥ 1:${r.minRR}`);
    if (g.minRet !== undefined) out.push(g.minRet >= 0 ? `Resultado ≥ +${g.minRet}%` : `No perder más de ${-g.minRet}%`);
    if (g.maxDD) out.push(`Drawdown ≤ ${g.maxDD}%`);
    if (g.minTrades) out.push(`≥ ${g.minTrades} operaciones`);
    if (g.robustPct) out.push(`Rentable en ≥ ${g.robustPct}% de mercados`);
    if (d.bars) out.push(`${d.bars} velas`);
    return out.map(t => `<span class="goal">${t}</span>`).join('');
  },
  render() {
    const done = CHALLENGES.filter(c => this.progress[c.id]?.done).length;
    $('#chSummary').innerHTML = `Completados: <b>${done} / ${CHALLENGES.length}</b> ${'🏆'.repeat(done)}`;
    $('#chGrid').innerHTML = CHALLENGES.map(c => {
      const p = this.progress[c.id] || {};
      return `<div class="ch-card ${p.done ? 'done' : ''}">
        <div class="top"><span class="ico">${c.icon}</span><div><h4>${c.title}</h4><div class="lvl">${c.level}${c.scenario ? ' · ' + SCENARIOS[c.scenario].name : ''}</div></div></div>
        <p>${c.desc}</p>
        <div class="goals">${this.goalChips(c)}</div>
        <div class="foot">
          <span class="small ${p.done ? 'pos' : 'muted'}">${p.done ? '✔ Completado' + (isNum(p.best) ? ` · mejor ${fmt.spct(p.best, 1)}` : '') : p.tries ? `${p.tries} intento(s)` : 'Sin intentar'}</span>
          <button class="btn ${p.done ? '' : 'primary'}" data-start="${c.id}">${p.done ? 'Repetir' : 'Empezar'}</button>
        </div>
      </div>`;
    }).join('');
  },
  start(id) {
    const d = CHALLENGES.find(c => c.id === id); if (!d) return;
    App.show('sim');
    if (d.type === 'robust') {
      Sim.challenge = null; this.robust = d;
      Sim.setSideTab('bot'); $('#botTestScen').value = 'mixed';
      this.renderBanner();
      toast('Diseña tus reglas en el panel 🤖 y pulsa “Robustez (20 mercados)” con escenario “Todos mezclados”.', 'info', 7000);
      return;
    }
    this.robust = null;
    Sim.challenge = null;
    Sim.newSession(d.scenario, randomSeed());
    Sim.challenge = { d, end: Sim.startBar + d.bars, done: false, result: null };
    this.renderBanner(); Sim.refresh();
    toast(`🏁 Reto “${d.title}” iniciado. Tienes ${d.bars} velas.`, 'info');
  },
  quit() { Sim.challenge = null; this.robust = null; this.renderBanner(); Sim.refresh(); },
  tick() {
    const ch = Sim.challenge; if (!ch || ch.done) return;
    const g = ch.d.goal;
    if (g.maxDD && Sim.eng.maxDD * 100 > g.maxDD) return this.finish(false, `Superaste el drawdown máximo permitido (${fmt.pct(Sim.eng.maxDD * 100, 1)} > ${g.maxDD}%).`);
    if (Sim.market.candles.length >= ch.end) this.evaluate();
  },
  evaluate() {
    const ch = Sim.challenge, eng = Sim.eng, cs = Sim.market.candles, L = cs.length - 1, g = ch.d.goal;
    if (eng.pos) eng.close(cs[L].c, L, 'Fin del reto');
    const ret = (eng.cash / eng.cap0 - 1) * 100, n = eng.trades.length, fails = [];
    if (g.minTrades && n < g.minTrades) fails.push(`Hiciste ${n} operación(es); el mínimo es ${g.minTrades}.`);
    if (g.minRet !== undefined && ret < g.minRet) fails.push(`Resultado ${fmt.spct(ret)} (objetivo ${g.minRet >= 0 ? '≥ +' + g.minRet : '≥ ' + g.minRet}%).`);
    if (g.maxDD && eng.maxDD * 100 > g.maxDD) fails.push(`Drawdown ${fmt.pct(eng.maxDD * 100, 1)} (máx. ${g.maxDD}%).`);
    this.finish(!fails.length, fails.length ? fails.join(' ') : `Resultado ${fmt.spct(ret)} con drawdown máximo de ${fmt.pct(eng.maxDD * 100, 1)}.`, ret);
  },
  finish(ok, msg, ret) {
    const ch = Sim.challenge, eng = Sim.eng, cs = Sim.market.candles, L = cs.length - 1;
    if (eng.pos) eng.close(cs[L].c, L, 'Fin del reto');
    if (ret === undefined) ret = (eng.cash / eng.cap0 - 1) * 100;
    ch.done = true; ch.result = { ok, msg };
    Sim.stop();
    const p = this.progress[ch.d.id] || { tries: 0 };
    p.tries = (p.tries || 0) + 1;
    if (ok) { p.done = true; p.best = Math.max(isNum(p.best) ? p.best : -Infinity, ret); }
    this.progress[ch.d.id] = p; Store.set('challenges', this.progress);
    toast(ok ? `🏆 ¡Reto superado! ${msg}` : `❌ Reto no superado. ${msg}`, ok ? 'good' : 'bad', 7000);
    this.render(); this.renderBanner();
  },
  validateOrder(o) {
    const r = Sim.challenge.d.rules || {};
    if (r.requireSL && o.sl == null) return 'el stop loss es obligatorio.';
    if (r.maxRiskPct && o.riskPct > r.maxRiskPct + 1e-6) return `el riesgo máximo es ${r.maxRiskPct}% por operación (estás arriesgando ${o.riskPct.toFixed(2)}%).`;
    if (r.minRR && !(o.rr >= r.minRR - 1e-6)) return `el ratio R:R debe ser al menos 1:${r.minRR} (pon un take profit más lejano).`;
    return null;
  },
  validateBot(cfg) {
    const r = Sim.challenge.d.rules || {};
    if (r.maxRiskPct && cfg.riskPct > r.maxRiskPct) return `el riesgo del bot debe ser ≤ ${r.maxRiskPct}%.`;
    if (r.minRR && !(cfg.tpAtr > 0 && cfg.tpAtr / cfg.slAtr >= r.minRR - 1e-6)) return `el bot necesita un objetivo con R:R ≥ 1:${r.minRR} (Objetivo ATR ≥ ${r.minRR} × Stop ATR).`;
    return null;
  },
  onRobust(res) {
    if (!this.robust) return;
    const d = this.robust, g = d.goal;
    if (res.mixed && res.pct >= g.robustPct && res.avg > 0) {
      const p = this.progress[d.id] || { tries: 0 };
      p.tries = (p.tries || 0) + 1; p.done = true; p.best = Math.max(isNum(p.best) ? p.best : -Infinity, res.avg);
      this.progress[d.id] = p; Store.set('challenges', this.progress);
      toast(`🏆 ¡Reto “${d.title}” superado! Rentable en ${res.pct.toFixed(0)}% de los mercados.`, 'good', 7000);
      this.robust = null;
    } else {
      const p = this.progress[d.id] || { tries: 0 }; p.tries = (p.tries || 0) + 1; this.progress[d.id] = p; Store.set('challenges', this.progress);
      toast(`Rentable en ${res.pct.toFixed(0)}% de los mercados${res.mixed ? '' : ' (usa el escenario “Todos mezclados”)'}. Objetivo: ≥ ${g.robustPct}% y retorno medio positivo.`, 'warn', 7000);
    }
    this.render(); this.renderBanner();
  },
  renderBanner() {
    const el = $('#chBanner'), ch = Sim.challenge;
    if (this.robust) {
      el.className = 'ch-banner';
      el.innerHTML = `<div class="chb-l"><div class="chb-title">🏁 Reto: ${this.robust.title}</div><div class="small muted">${this.robust.desc}</div></div><div class="chb-r"><button class="btn" data-cha="quit">Abandonar</button></div>`;
      return;
    }
    if (!ch) { el.className = 'ch-banner hidden'; el.innerHTML = ''; return; }
    const eng = Sim.eng, cs = Sim.market.candles, done = cs.length - Sim.startBar, total = ch.d.bars;
    const ret = (eng.equity(cs[cs.length - 1].c) / eng.cap0 - 1) * 100;
    el.className = 'ch-banner' + (ch.done ? (ch.result.ok ? ' ok' : ' fail') : '');
    el.innerHTML = `
      <div class="chb-l"><div class="chb-title">🏁 Reto: ${ch.d.title}</div><div class="chb-goals">${this.goalChips(ch.d)}</div></div>
      <div class="chb-m"><div class="prog"><div style="width:${Math.min(100, done / total * 100)}%"></div></div>
        <div class="small muted">Vela ${Math.min(done, total)} de ${total} · Resultado <b class="${cls(ret)}">${fmt.spct(ret)}</b> · Drawdown ${fmt.pct(eng.maxDD * 100, 1)} · ${eng.trades.length} ops</div></div>
      <div class="chb-r">${ch.done
        ? `<div class="chb-res">${ch.result.ok ? '🏆 ¡Superado!' : '❌ No superado'}<span class="small">${ch.result.msg}</span></div><button class="btn primary" data-cha="retry">Reintentar</button><button class="btn" data-cha="list">Ver retos</button>`
        : '<button class="btn" data-cha="quit">Abandonar</button>'}</div>`;
  },
  onShow() { this.render(); }
};
