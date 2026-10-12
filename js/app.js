'use strict';
/* =========================================================
   Arranque, navegación, tema y ajustes
   ========================================================= */

const App = {
  tab: 'sim',
  modules: () => ({ sim: Sim, predict: Predict, options: Opt, mc: MC, challenges: Challenges, stats: Stats }),
  init() {
    $$('#tabs button').forEach(b => b.onclick = () => this.show(b.dataset.tab));
    $('#btnTheme').onclick = () => this.toggleTheme();
    $('#btnSettings').onclick = () => this.openSettings();
    $('#dlgSettings').addEventListener('close', () => this.saveSettings());

    Bot.init(); Sim.init(); Challenges.init(); Predict.init(); Opt.init(); MC.init(); Stats.init(); Learn.init();

    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => this.redraw(), 120); });
    const h = location.hash.slice(1);
    if (h && $('#tab-' + h)) this.show(h);
  },
  show(t) {
    this.tab = t;
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
    try { history.replaceState(null, '', '#' + t); } catch (e) { /* file:// */ }
    if (t !== 'sim') Sim.stop();
    window.scrollTo(0, 0);
    this.redraw();
  },
  redraw() { const m = this.modules()[this.tab]; if (m && m.onShow) m.onShow(); },
  toggleTheme() {
    const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t; Store.set('theme', t);
    resetThemeColors();
    Sim.refresh(); Predict.chart.render(); this.redraw();
  },
  openSettings() {
    $('#setCap').value = Settings.capital; $('#setFee').value = Settings.fee; $('#setLev').value = Settings.maxLev;
    $('#dlgSettings').showModal();
  },
  saveSettings() {
    if ($('#dlgSettings').returnValue !== 'ok') return;
    const cap = parseFloat($('#setCap').value), fee = parseFloat($('#setFee').value), lev = parseFloat($('#setLev').value);
    if (isNum(cap) && cap >= 100) Settings.capital = Math.round(cap);
    if (isNum(fee) && fee >= 0) Settings.fee = Math.min(fee, 5);
    if (isNum(lev) && lev >= 1) Settings.maxLev = Math.min(lev, 100);
    saveSettings();
    toast('Ajustes guardados. Se aplicarán en el próximo “Nuevo mercado”.', 'good');
    if (this.tab === 'mc') MC.run();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
